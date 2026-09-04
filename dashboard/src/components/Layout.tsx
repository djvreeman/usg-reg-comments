import { Outlet } from 'react-router-dom'
import Header from './Header'
import Navigation from './Navigation'

function Layout() {
  return (
    <div className="min-h-screen bg-[#f3f5f6] overflow-x-hidden flex flex-col">
      <div className="bg-hl7-black">
        <div className="h-1 bg-hl7-red" aria-hidden="true" />
        <Header />
        <div className="max-w-7xl mx-auto px-2 sm:px-6 lg:px-8 pb-4">
          <Navigation />
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-2 sm:px-6 lg:px-8 py-4 sm:py-6 flex-1 w-full">
        <main>
          <Outlet />
        </main>
      </div>

      <footer className="bg-hl7-black mt-8">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3 flex justify-between items-center text-xs text-hl7-light-blue">
          <span>AI-powered analysis of public comments</span>
          <a href="../../skill/SKILL.md" className="hover:text-white transition-colors">
            AI Skill
          </a>
        </div>
      </footer>
    </div>
  )
}

export default Layout
