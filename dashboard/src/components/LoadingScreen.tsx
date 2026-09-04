import { Loader2 } from 'lucide-react'

function LoadingScreen() {
  return (
    <div className="min-h-screen bg-[#f3f5f6] flex flex-col">
      <div className="bg-hl7-black">
        <div className="h-1 bg-hl7-red" aria-hidden="true" />
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <p className="text-white font-bold text-xl">Interoperability Comment Analysis</p>
          <p className="text-hl7-light-blue text-sm">Loading comment analysis data...</p>
        </div>
      </div>
      <div className="flex-1 flex items-center justify-center">
        <Loader2 className="h-12 w-12 animate-spin text-hl7-blue" />
      </div>
    </div>
  )
}

export default LoadingScreen
