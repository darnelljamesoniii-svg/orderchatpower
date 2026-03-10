export default function SalesSuccessPage() {
  return (
    <main className="min-h-screen bg-gray-950 text-white flex items-center justify-center p-6">
      <div className="w-full max-w-xl rounded-2xl border border-emerald-500/30 bg-emerald-950/20 p-8 text-center">
        <h1 className="text-3xl font-bold mb-3">Payment Received</h1>
        <p className="text-gray-200 mb-6">
          Your zone lock payment was submitted successfully. Our team will confirm activation and follow up right away.
        </p>
        <a
          href="/"
          className="inline-block rounded-xl bg-emerald-500 text-gray-950 font-semibold px-5 py-3 hover:bg-emerald-400 transition-colors"
        >
          Back to Dashboard
        </a>
      </div>
    </main>
  );
}
