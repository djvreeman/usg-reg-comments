import { AlertCircle } from 'lucide-react'

interface ErrorScreenProps {
  error: string | null
}

function ErrorScreen({ error }: ErrorScreenProps) {
  return (
    <div className="min-h-screen bg-[#f3f5f6] flex flex-col">
      <div className="bg-hl7-black">
        <div className="h-1 bg-hl7-red" aria-hidden="true" />
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <a href="../" className="text-sm text-hl7-light-blue hover:text-white">← All dockets</a>
          <p className="text-white font-bold text-xl">Interoperability Comment Analysis</p>
        </div>
      </div>
      <div className="flex-1 flex items-center justify-center px-4">
        <div className="text-center max-w-md">
          <AlertCircle className="h-12 w-12 text-hl7-red mx-auto" />
          <h2 className="mt-4 text-xl font-semibold text-hl7-black">Failed to Load Data</h2>
          <p className="mt-2 text-hl7-dark-gray">{error || 'An unexpected error occurred'}</p>
          <button
            onClick={() => window.location.reload()}
            className="mt-4 px-4 py-2 bg-hl7-blue text-white rounded-lg hover:bg-hl7-blue-dk transition-colors"
          >
            Reload Page
          </button>
        </div>
      </div>
    </div>
  )
}

export default ErrorScreen
