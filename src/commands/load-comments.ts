import { Command } from "commander";
import { Database } from "bun:sqlite";
import { createReadStream, readFileSync } from "fs";
import { parse } from "csv-parse";
import { basename, extname } from "path";
import { openDb, withTransaction } from "../lib/database";
import { initDebug, debugLog } from "../lib/debug";
import type { CommentAttributes } from "../types";

export const loadCommentsCommand = new Command("load")
  .description("Load comments from regulations.gov API or CSV file")
  .argument("<source>", "Document ID (e.g., CMS-2025-0050-0031) or path to CSV file")
  .option("-k, --api-key <key>", "Regulations.gov API key", process.env.REGSGOV_API_KEY || "DEMO_KEY")
  .option("--skip-attachments", "Skip downloading attachments")
  .option("-l, --limit <n>", "Stop after N comments", parseInt)
  .option("-d, --debug", "Enable debug output")
  .action(loadComments);

async function loadComments(source: string, options: any) {
  await initDebug(options.debug);
  
  // Determine if source is file or document ID
  const isFile = source.includes(".") || source.includes("/");
  
  if (isFile) {
    await loadFromCsv(source, options);
  } else {
    await loadFromApi(source, options);
  }
}

// Load from regulations.gov API
async function loadFromApi(documentId: string, options: any) {
  console.log(`📥 Loading comments for document ${documentId} from regulations.gov API`);
  
  const db = openDb(documentId);
  const headers = { "X-Api-Key": options.apiKey };
  const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));
  const isDemoKey = !options.apiKey || options.apiKey === "DEMO_KEY";
  // DEMO_KEY is typically ~30 req/hour. Keep API calls spaced so a 47-comment docket can finish.
  let apiDelayMs = isDemoKey ? 130000 : 1200;
  if (isDemoKey) {
    console.log("⚠️  Using DEMO_KEY — spacing API calls by 130s to stay under hourly limits");
  }

  // Retry-with-backoff wrapper for regulations.gov API fetches
  async function fetchWithRetry(url: string, opts: RequestInit = {}, maxRetries = 10): Promise<Response> {
    const useApiKey = url.includes("api.regulations.gov");
    const reqHeaders = useApiKey ? { ...headers, ...(opts.headers || {}) } : { ...(opts.headers || {}) };
    if (useApiKey && apiDelayMs > 0) {
      await sleep(apiDelayMs);
    }
    for (let attempt = 0; attempt < maxRetries; attempt++) {
      const resp = await fetch(url, { ...opts, headers: reqHeaders });
      if (resp.status === 429) {
        apiDelayMs = Math.max(apiDelayMs, 130000);
        const backoff = Math.min(15000 * Math.pow(2, attempt), 180000);
        console.log(`   ⏳ 429 rate limited, waiting ${(backoff/1000).toFixed(0)}s (attempt ${attempt+1}/${maxRetries})...`);
        await sleep(backoff);
        continue;
      }
      return resp;
    }
    // Last attempt, return whatever we get
    return fetch(url, { ...opts, headers: reqHeaders });
  }
  
  try {
    // Reuse stored metadata when resuming so DEMO_KEY quota isn't spent on the same lookups
    const existingMeta = db.prepare("SELECT metadata_json, agency_name FROM document_metadata WHERE document_id = ?").get(documentId) as
      | { metadata_json: string; agency_name: string }
      | undefined;
    let objectId: string | undefined;
    let docAttrs: any;
    let agencyId: string;
    let agencyName: string;

    if (existingMeta?.metadata_json) {
      docAttrs = JSON.parse(existingMeta.metadata_json);
      objectId = docAttrs.objectId;
      agencyId = docAttrs.agencyId || documentId.split("-")[0];
      agencyName = existingMeta.agency_name || agencyId;
      console.log(`♻️  Reusing stored document metadata (objectId ${objectId})`);
    } else {
      console.log("🔍 Resolving document object ID...");
      const docResponse = await fetchWithRetry(
        `https://api.regulations.gov/v4/documents/${documentId}`
      );

      if (!docResponse.ok) {
        throw new Error(`Failed to fetch document: ${docResponse.status} ${docResponse.statusText}`);
      }

      const docData: any = await docResponse.json();
      objectId = docData.data.attributes.objectId;
      debugLog(`Object ID: ${objectId}`);

      docAttrs = docData.data.attributes;
      agencyId = docAttrs.agencyId || documentId.split("-")[0];
      agencyName = agencyId;
      try {
        const agencyResponse = await fetchWithRetry(
          `https://api.regulations.gov/v4/agencies/${agencyId}`
        );
        if (agencyResponse.ok) {
          const agencyData: any = await agencyResponse.json();
          agencyName = agencyData.data.attributes.name || agencyId;
        }
      } catch (e) {
        console.warn(`⚠️  Could not fetch agency name for ${agencyId}`);
      }

      db.prepare(`
        INSERT OR REPLACE INTO document_metadata (
          document_id, title, docket_id, agency_id, agency_name,
          document_type, posted_date, comment_start_date, comment_end_date,
          metadata_json, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
      `).run(
        documentId,
        docAttrs.title || documentId,
        docAttrs.docketId || documentId,
        agencyId,
        agencyName,
        docAttrs.documentType || "Unknown",
        docAttrs.postedDate || null,
        docAttrs.commentStartDate || null,
        docAttrs.commentEndDate || null,
        JSON.stringify(docAttrs)
      );

      console.log(`💾 Saved document metadata: ${docAttrs.title || documentId}`);
    }

    if (!objectId) {
      throw new Error("Could not resolve document objectId");
    }
    
    // Get existing comment count
    const existingCount = db.prepare("SELECT COUNT(*) as count FROM comments").get() as { count: number };
    console.log(`📊 Existing comments in database: ${existingCount.count}`);
    
    // List all comment IDs. The v4 API returns at most 20 pages (5,000) per query,
    // so walk lastModifiedDate windows to collect dockets larger than that.
    console.log("📋 Fetching comment list...");
    const commentIds: string[] = [];
    const seenIds = new Set<string>();
    let listedFromApi = false;

    const toEasternFilter = (iso: string): string => {
      const parts = new Intl.DateTimeFormat("en-CA", {
        timeZone: "America/New_York",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hour12: false,
      }).formatToParts(new Date(iso));
      const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "00";
      return `${get("year")}-${get("month")}-${get("day")} ${get("hour")}:${get("minute")}:${get("second")}`;
    };

    try {
      let dateGe = "1900-01-01 00:00:00";
      let safety = 0;

      while (safety++ < 40) {
        let page = 1;
        let lastModified: string | undefined;
        let windowCount = 0;

        while (page <= 20) {
          const url =
            `https://api.regulations.gov/v4/comments?filter[commentOnId]=${objectId}` +
            `&filter[lastModifiedDate][ge]=${encodeURIComponent(dateGe)}` +
            `&page[size]=250&page[number]=${page}&sort=lastModifiedDate`;
          const response = await fetchWithRetry(url, {}, 4);

          if (!response.ok) {
            throw new Error(`Failed to fetch comments: ${response.status} ${response.statusText}`);
          }

          const data: any = await response.json();
          if (!data.data || data.data.length === 0) break;

          for (const item of data.data) {
            if (!seenIds.has(item.id)) {
              seenIds.add(item.id);
              commentIds.push(item.id);
            }
            lastModified = item.attributes?.lastModifiedDate || lastModified;
          }
          windowCount += data.data.length;
          listedFromApi = true;
          console.log(`  Window ${safety} page ${page}: +${data.data.length} (unique: ${commentIds.length})`);

          if (data.data.length < 250 || data.meta?.lastPage) break;
          page++;
        }

        if (windowCount === 0 || !lastModified) break;
        // A short window that didn't fill 20 pages means we reached the end
        if (page < 20 && windowCount < 5000) break;

        const nextGe = toEasternFilter(lastModified);
        if (nextGe === dateGe) break;
        dateGe = nextGe;
      }
    } catch (err) {
      console.warn(`⚠️  Comment list API failed (${err}). Falling back to sequential document IDs.`);
    }

    if (!listedFromApi) {
      const prefix = documentId.replace(/-\d+$/, "");
      for (let i = 2; i <= 80; i++) {
        commentIds.push(`${prefix}-${String(i).padStart(4, "0")}`);
      }
      console.log(`📋 Using sequential IDs ${commentIds[0]} … ${commentIds[commentIds.length - 1]}`);
    }
    
    console.log(`📊 Total comments available: ${commentIds.length}`);
    
    // Filter out already loaded comments
    const loadedIds = db.prepare("SELECT id FROM comments").all().map((r: any) => r.id);
    const newIds = commentIds.filter(id => !loadedIds.includes(id));
    console.log(`🆕 New comments to load: ${newIds.length}`);
    
    // Apply limit if specified
    const idsToLoad = options.limit ? newIds.slice(0, options.limit - existingCount.count) : newIds;
    console.log(`🎯 Will load ${idsToLoad.length} comments`);
    
    // Prepare statements
    const insertComment = db.prepare("INSERT OR REPLACE INTO comments (id, attributes_json) VALUES (?, ?)");
    const insertAttachment = db.prepare(`
      INSERT OR REPLACE INTO attachments (id, comment_id, format, file_name, url, size, blob_data)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);
    
    let loaded = 0;
    let skipped = 0;
    
    for (const commentId of idsToLoad) {
      try {
        // 1️⃣ Fetch comment details with relationships to attachments
        const url = `https://api.regulations.gov/v4/comments/${commentId}?include=attachments`;
        const response = await fetchWithRetry(url);
        if (!response.ok) {
          if (response.status === 404 && !listedFromApi) {
            continue;
          }
          console.error(`❌ Failed to fetch comment ${commentId}: ${response.status}`);
          continue;
        }

        const data: any = await response.json();

        // 2️⃣ Gather attachment metadata (+ optional binary)
        type APIAttachment = {
          id: string;
        };

        type AttachmentRecord = {
          id: string;
          fmt: string;
          fileName: string;
          url: string;
          size: number | null;
          blob: Uint8Array | null;
        };

        const attachments: AttachmentRecord[] = [];
        let attachmentFailures = 0;

        const relationshipData: APIAttachment[] = data.data.relationships?.attachments?.data || [];
        const includedById = new Map<string, any>(
          (data.included || [])
            .filter((item: any) => item?.type === "attachments" && item.id)
            .map((item: any) => [item.id, item])
        );

        for (const rel of relationshipData) {
          let fileFormats: any[] | undefined = includedById.get(rel.id)?.attributes?.fileFormats;

          if (!fileFormats) {
            const attUrl = `https://api.regulations.gov/v4/attachments/${rel.id}?include=fileFormats`;
            const attResp = await fetchWithRetry(attUrl);
            if (!attResp.ok) {
              console.error(`\n❌ Failed to fetch attachment metadata ${rel.id}: ${attResp.status}`);
              attachmentFailures++;
              continue;
            }
            const attData: any = await attResp.json();
            fileFormats = attData.data.attributes.fileFormats || [];
          }

          for (const format of fileFormats || []) {
            const fileUrl: string | undefined = format.downloadUrl || format.fileUrl;
            if (!fileUrl) continue;

            const fmt = (format.fileFormat || format.format || "bin").toLowerCase();
            const fileName = `${rel.id}.${fmt}`;

            let blob: Uint8Array | null = null;
            let size: number | null = format.size || null;

            if (!options.skipAttachments) {
              try {
                const binResp = await fetchWithRetry(fileUrl, { headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36", "Accept": "application/pdf,*/*" } });
                if (binResp.ok) {
                  const buffer = new Uint8Array(await binResp.arrayBuffer());
                  blob = buffer;
                  size = buffer.length;
                  debugLog(`Downloaded ${fileName}: ${size} bytes`);
                } else {
                  console.error(`\n❌ Failed to download attachment ${fileName}: ${binResp.status}`);
                  attachmentFailures++;
                  break; // Skip this comment entirely
                }
              } catch (e) {
                console.error(`\n❌ Error downloading attachment ${fileName}:`, e);
                attachmentFailures++;
                break; // Skip this comment entirely
              }
            }

            attachments.push({ id: format.formatId || rel.id, fmt, fileName, url: fileUrl, size, blob });
          }

          // If we had failures, skip this comment
          if (attachmentFailures > 0) break;

          // modest delay to respect rate limits
          await sleep(1000);
        }

        // 3️⃣ Only save comment if all attachments were successfully downloaded (or skipped)
        if (attachmentFailures > 0 && !options.skipAttachments) {
          console.error(`\n⚠️  Skipping comment ${commentId} due to ${attachmentFailures} attachment failure(s)`);
          skipped++;
          continue;
        }

        withTransaction(db, () => {
          insertComment.run(commentId, JSON.stringify(data.data.attributes));
          for (const att of attachments) {
            insertAttachment.run(
              att.id,
              commentId,
              att.fmt,
              att.fileName,
              att.url,
              att.size,
              att.blob
            );
          }
        });

        loaded++;
        process.stdout.write(`\r✅ Loaded ${loaded}/${idsToLoad.length} comments`);
      } catch (error) {
        console.error(`\n❌ Error loading comment ${commentId}:`, error);
      }
    }
    
    console.log(`\n✅ Successfully loaded ${loaded} comments`);
    if (skipped > 0) {
      console.log(`⚠️  Skipped ${skipped} comments due to attachment failures`);
      console.log(`💡 To retry these comments, run the load command again`);
    }
    
  } finally {
    db.close();
  }
}

// Load from CSV file
async function loadFromCsv(csvPath: string, options: any) {
  console.log(`📥 Loading comments from CSV file: ${csvPath}`);
  
  // Extract document ID from CSV filename or use generic ID
  const csvBasename = basename(csvPath, extname(csvPath));
  const documentId =  csvBasename;
  
  console.log(`📄 Using document ID: ${documentId}`);
  
  const db = openDb(documentId);
  
  // Prepare statements
  const insertComment = db.prepare("INSERT OR REPLACE INTO comments (id, attributes_json) VALUES (?, ?)");
  const insertAttachment = db.prepare(`
    INSERT OR REPLACE INTO attachments (id, comment_id, format, file_name, url, size, blob_data)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);
  
  // CSV field mapping
  const fieldMap: Record<string, keyof CommentAttributes> = {
    "Document ID": "id",
    "Agency ID": "agencyId",
    "Docket ID": "docketId",
    "Document Type": "documentType",
    "Title": "title",
    "Posted Date": "postedDate",
    "Comment": "comment",
    "First Name": "firstName",
    "Last Name": "lastName",
    "Organization Name": "organization",
    "Submitter Representative": "submitterRep",
    "Category": "category",
    "State/Province": "stateProvinceRegion",
    "Country": "country",
    "Received Date": "receiveDate",
    "Page Count": "pageCount",
  };
  
  // Get existing count
  const existingCount = db.prepare("SELECT COUNT(*) as count FROM comments").get() as { count: number };
  const skipCount = existingCount.count;
  console.log(`📊 Existing comments: ${existingCount.count}`);
  
  // Parse CSV
  const parser = createReadStream(csvPath, "utf8").pipe(
    parse({
      columns: true,
      skip_empty_lines: true,
    })
  );
  
  let processed = 0;
  let loaded = 0;
  let skipped = 0;
  
  try {
    for await (const row of parser) {
      processed++;
      
      // Skip already loaded rows
      if (processed <= skipCount) continue;
      
      // Check limit
      if (options.limit && loaded >= options.limit) {
        console.log(`\n🛑 Reached limit of ${options.limit} comments`);
        break;
      }
      
      const commentId = row["Document ID"] || `row${processed}`;
      
      // Build attributes object
      const attributes: CommentAttributes = {};
      for (const [csvField, attrField] of Object.entries(fieldMap)) {
        if (row[csvField]) {
          if (attrField === "pageCount") {
            const parsed = parseInt(row[csvField]);
            if (!isNaN(parsed)) {
              attributes[attrField] = parsed;
            }
          } else {
            attributes[attrField] = row[csvField];
          }
        }
      }
      
      // Handle display properties
      const displayProps = row["Display Properties (Name, Label, Tooltip)"];
      if (displayProps) {
        attributes.displayProperties = displayProps
          .split(";")
          .map((s: string) => s.trim())
          .filter(Boolean)
          .map((piece: string) => {
            const [name, label, tooltip] = piece.split(/\s*,\s*/);
            return { name, label, tooltip };
          });
      }
      
      // Gather attachment info (and optionally download files)
      const urls = (
        (row["Attachment Files"] || "") + ";" + (row["Content Files"] || "")
      )
        .split(/[\s;,|]+/)
        .map(u => u.trim())
        .filter(Boolean);

      type AttachmentData = {
        attachId: string;
        fmt: string;
        fileName: string;
        url: string;
        size: number | null;
        blob: Uint8Array | null;
      };

      const attachments: AttachmentData[] = [];
      let attachmentFailures = 0;

      for (let i = 0; i < urls.length; i++) {
        const url = urls[i];
        const fmt = extname(url).replace(".", "").toLowerCase() || "bin";
        const attachId = `${commentId}-att${i + 1}`;
        const fileName = basename(url);

        let size: number | null = null;
        let blob: Uint8Array | null = null;

        if (!options.skipAttachments) {
          try {
            const resp = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36", "Accept": "application/pdf,*/*" } });
            if (resp.ok) {
              const buffer = new Uint8Array(await resp.arrayBuffer());
              blob = buffer;
              size = buffer.length;
              debugLog(`Downloaded ${fileName}: ${size} bytes`);
            } else {
              console.error(`❌ Failed to download attachment ${fileName}: ${resp.status}`);
              attachmentFailures++;
              break; // Skip this comment entirely
            }
          } catch (e) {
            console.error(`❌ Error downloading attachment ${fileName}:`, e);
            attachmentFailures++;
            break; // Skip this comment entirely
          }
        }

        attachments.push({ attachId, fmt, fileName, url, size, blob });
      }

      // Only save comment if all attachments were successfully downloaded (or skipped)
      if (attachmentFailures > 0 && !options.skipAttachments) {
        console.error(`⚠️  Skipping comment ${commentId} due to ${attachmentFailures} attachment failure(s)`);
        skipped++;
        continue;
      }

      // Save comment & attachments inside a single transaction (sync)
      withTransaction(db, () => {
        insertComment.run(commentId, JSON.stringify(attributes));

        for (const att of attachments) {
          insertAttachment.run(
            att.attachId,
            commentId,
            att.fmt,
            att.fileName,
            att.url,
            att.size,
            att.blob
          );
        }
      });
      
      loaded++;
      
      if (loaded % 5 === 0 || loaded === 1) {
        process.stdout.write(`\r📥 Loaded ${loaded} comments (${skipped} skipped)...`);
      }
    }
    
    console.log(`\n✅ Successfully loaded ${loaded} new comments (${existingCount.count + loaded} total)`);
    if (skipped > 0) {
      console.log(`⚠️  Skipped ${skipped} comments due to attachment failures`);
      console.log(`💡 To retry these comments, run the load command again`);
    }
    
  } finally {
    db.close();
  }
}
