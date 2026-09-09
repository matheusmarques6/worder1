// =============================================
// /email/campaigns — redirecionamento
//
// Existiam duas listas de campanhas. O menu lateral abre /campaigns, que
// é a multicanal e tem filtros, duplicar, pausar/retomar e destravar;
// esta era uma segunda lista de e-mail, sem link no menu, que ninguém
// alcançava sem digitar a URL. Duas listas para a mesma coisa é o mesmo
// problema que /forms e /site/forms tinham: o lojista muda o estado numa
// e vê o antigo na outra.
//
// Sobrou a de /campaigns, e o que era melhor aqui foi para lá: o painel
// de saúde do envio, os números que vêm dos envios de verdade e o motivo
// da falha na linha da campanha.
//
// O construtor continua em /email/campaigns/new, para onde o seletor de
// canal de /campaigns/create manda.
// =============================================
import { redirect } from 'next/navigation'

export default function EmailCampaignsIndexPage() {
  redirect('/campaigns')
}
