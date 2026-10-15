import { redirect } from 'next/navigation'

// No protótipo, abrir um agente leva ao Construtor dele em tela cheia; a
// antiga tela do agente (órbita) não existe mais. Links antigos caem aqui.
export default function AgentPage({ params }: { params: { id: string } }) {
  redirect(`/ai/construtor/${params.id}`)
}
