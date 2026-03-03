import Link from 'next/link'

export default function Home() {
  return (
    <main className="min-h-screen flex flex-col items-center justify-center bg-gradient-to-b from-sky-50 to-white p-8">
      <div className="text-center max-w-md">
        <div className="text-6xl mb-6">🏥</div>
        <h1 className="text-4xl font-bold text-sky-700 mb-3">Baymax 2.0</h1>
        <p className="text-xl text-gray-600 mb-10">
          AI Care Companion for Elderly Singaporeans
        </p>
        <div className="flex flex-col gap-4">
          <Link
            href="/patient"
            className="block w-full py-4 px-6 text-xl font-semibold text-white bg-sky-500 rounded-2xl hover:bg-sky-600 transition-colors text-center"
          >
            Patient Portal
          </Link>
          <Link
            href="/caregiver"
            className="block w-full py-4 px-6 text-xl font-semibold text-white bg-emerald-500 rounded-2xl hover:bg-emerald-600 transition-colors text-center"
          >
            Caregiver Dashboard
          </Link>
          <Link
            href="/clinician"
            className="block w-full py-4 px-6 text-xl font-semibold text-white bg-violet-500 rounded-2xl hover:bg-violet-600 transition-colors text-center"
          >
            Clinician View
          </Link>
        </div>
      </div>
    </main>
  )
}
