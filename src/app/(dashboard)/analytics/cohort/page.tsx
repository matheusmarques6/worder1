import { redirect } from 'next/navigation'

// The standalone cohort page never rendered real data — its fetch discarded
// results and always called setCohortData([]), so it permanently showed
// "Dados insuficientes" and the Retenção/Receita toggle did nothing.
// The working cohort analysis (with the real calculate + matrix pipeline)
// already lives under Métricas Avançadas, so we send merchants there instead
// of keeping a dead page around.
export default function CohortPage() {
  redirect('/analytics/shopify/advanced')
}
