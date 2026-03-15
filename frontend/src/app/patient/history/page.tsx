export default function HistoryPage() {
  return (
    <main className="bg-sky-50 flex flex-col items-center justify-center" style={{ height: '100%' }}>
      <div className="text-center px-8">
        <div className="text-6xl mb-6">📋</div>
        <h1 className="font-bold text-gray-700 mb-3" style={{ fontSize: '28px' }}>
          Conversation History
        </h1>
        <p className="text-gray-400" style={{ fontSize: '20px', lineHeight: '1.6' }}>
          Your past conversations will appear here soon.
        </p>
        <p className="text-gray-300 mt-4" style={{ fontSize: '18px' }}>
          对话记录即将推出
        </p>
      </div>
    </main>
  )
}
