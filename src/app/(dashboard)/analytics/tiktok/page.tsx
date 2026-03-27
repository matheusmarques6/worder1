export default function TikTokAdsAnalyticsPage() {
  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">TikTok Ads</h1>
        <p className="text-gray-500 mt-1">Acompanhe o desempenho das suas campanhas no TikTok Ads</p>
      </div>
      <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
        <div className="text-6xl mb-4">📊</div>
        <h3 className="text-lg font-semibold text-gray-900">Conecte sua conta</h3>
        <p className="text-gray-500 mt-2 max-w-md mx-auto">
          Integre sua conta do TikTok Ads para visualizar métricas de campanhas, grupos de anúncios e anúncios em tempo real.
        </p>
        <button className="mt-6 px-6 py-2.5 bg-brand-500 text-white rounded-lg hover:bg-brand-600 transition-colors font-medium">
          Conectar TikTok Ads
        </button>
      </div>
    </div>
  )
}
