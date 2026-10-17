import { redirect } from 'next/navigation'

// No protótipo, abrir um agente leva ao Construtor dele em tela cheia; a
// antiga tela do agente (órbita) não existe mais. Links antigos caem aqui.
export default async function AgentPage(props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  redirect(`/ai/construtor/${params.id}`)
}
