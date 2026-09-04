import { FileText } from 'lucide-react'
import useStore from '../store/useStore'

function Header() {
  const { meta } = useStore()

  return (
    <header>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center py-3 sm:py-4">
          <div className="flex items-center space-x-3 min-w-0">
            <FileText className="h-7 w-7 sm:h-8 sm:w-8 text-hl7-light-blue flex-shrink-0" />
            <div className="min-w-0">
              <a href="../" className="text-xs sm:text-sm text-hl7-light-blue hover:text-white transition-colors">
                ← All dockets
              </a>
              <h1 className="text-xl sm:text-2xl font-bold text-white truncate">Interoperability Comment Analysis</h1>
              <p className="text-sm text-hl7-light-blue truncate">
                Document: {meta?.documentId || 'Loading...'}
                {meta?.stats && (
                  <span className="ml-2">
                    • {meta.stats.totalComments.toLocaleString()} comments
                  </span>
                )}
              </p>
            </div>
          </div>
        </div>
      </div>
    </header>
  )
}

export default Header
