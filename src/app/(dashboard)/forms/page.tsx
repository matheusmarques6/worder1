// =============================================
// /forms — redirecionamento
//
// Durante um tempo existiram duas listas de popups: esta e /site/forms.
// Tinham as mesmas ações e números diferentes — o lojista pausava um
// popup numa tela e via o outro estado na outra, e o menu lateral só
// levava a uma delas. Sobrou a de /site/forms, que mostra métricas,
// saúde e a galeria de modelos; o que só existia aqui (o aviso de
// ativação do embed, o código de instalação e as inscrições) foi junto.
//
// Este arquivo fica para os links antigos e os favoritos do lojista não
// darem em 404. As páginas de detalhe (/forms/[id], .../submissions,
// .../analytics) continuam onde estavam.
// =============================================
import { redirect } from 'next/navigation'

export default function FormsIndexPage() {
  redirect('/site/forms')
}
