// API simulada para a comparação visual da aba IA. Dados no espírito do
// protótipo (Duda, Leo, Bia). Os números agregados vêm de fixtures/, gerados
// com as funções puras reais (activity-summary, block-metrics).
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
const DIR = path.dirname(fileURLToPath(import.meta.url))
const J = (f) => JSON.parse(fs.readFileSync(path.join(DIR, 'fixtures', f), 'utf8'))
const now=new Date().toISOString();
const persona={tone:'friendly',response_length:'short',guidelines:['Nunca prometer data exata de entrega','Nunca falar de efeito medicinal']};
const settings={tools:{enabled:['transfer_to_human','search_knowledge','get_product_info']},safety:{blocked_topics:['política','saúde'],handoff_keywords:['atendente','humano','reclamação'],handoff_message:'Vou chamar alguém da equipe.'},judges:{custom:[{id:'j1',name:'Tom da marca',criterion:'Mantém o tom da marca',active:true}]}};
const agentRow=(id,name,role,status)=>({id,name,role,status,is_active:status==='active',provider:'openrouter',model:'openai/gpt-4.1-mini',monthly_cap_usd:80,persona,settings,presentation_mode:'nome_funcao',client_adaptation:{mirror_tone:true,emoji_if_client:true},created_at:now});
const AG={ 'a-duda':agentRow('a-duda','Duda','Vendas','active'),'a-leo':agentRow('a-leo','Leo','Pós-compra','active'),'a-bia':agentRow('a-bia','Bia','Recuperação por e-mail','paused')};
const entries={'a-duda':[{id:'e1',agent_id:'a-duda',kind:'whatsapp_account',ref_id:'w1',active:true,label:'+55 11 4000-1234',created_at:now},{id:'e2',agent_id:'a-duda',kind:'flow_touch',ref_id:'f1',active:true,label:'Carrinho abandonado · toque 2',created_at:now}],'a-leo':[{id:'e3',agent_id:'a-leo',kind:'whatsapp_account',ref_id:'w2',active:true,label:'+55 11 4000-5678',created_at:now}],'a-bia':[]};
const list=Object.values(AG).map(a=>({...a,entries:entries[a.id],missions_count:2,conversations_7d:a.id==='a-duda'?412:a.id==='a-leo'?188:0,revenue_7d:a.id==='a-duda'?18420:a.id==='a-leo'?3210:0}));
const note=(id,name,folder,readers,extra={})=>({id,name,folder,kind:'note',status:'ready',read_only:false,tags:['troca'],links:[],updated_at:now,chunks_count:4,source_type:'note',url:null,error_message:null,readers,...extra});
const notes=[note('s3','Política de troca','Políticas',['a-duda','a-leo']),note('s4','Garantia e assistência','Políticas',['a-leo']),note('s2','Prazos de entrega','Frete e entrega',['a-duda','a-leo']),note('s5','Frete grátis','Frete e entrega',['a-duda']),note('s6','Formas de pagamento','Pagamento',['a-duda']),note('s1','Catálogo Shopify','Sincronizadas',['a-duda','a-leo'],{read_only:true,source_type:'shopify',status:'processing'})];
const folders=[...new Set(notes.map(n=>n.folder))].map(f=>({folder:f,notes:notes.filter(n=>n.folder===f)}));
const body=`O cliente tem **30 dias a partir do recebimento** para pedir troca ou devolução.\n\n## Como funciona\n- A primeira troca é gratuita.\n- O produto precisa estar lacrado.\n\n> [!rule] Regra que o agente nunca quebra\n> Não aprovar troca depois de 30 dias.\n\nPrazos de envio seguem [[Prazos de entrega]].`;
export function mock(url, method){
  const u=new URL(url); const p=u.pathname;
  let m;
  if(p==='/api/auth') return {user:{id:'u1',email:'ryan@x.com',name:'Ryan Fernando Silva Oliveira',organization_id:'org1',role:'owner'},organization:{id:'org1',name:'Loja Demo'}};
  if(p==='/api/ai/agents') return method==='GET'?{agents:list}:{agent:AG['a-duda']};
  if((m=p.match(/^\/api\/ai\/agents\/([^/]+)$/))) return {agent:AG[m[1]]??AG['a-duda']};
  if((m=p.match(/^\/api\/ai\/agents\/([^/]+)\/entries$/))) return {entries:entries[m[1]]??[]};
  if(p.endsWith('/sources')) return {sources:notes.map(n=>({...n,status:'ready'}))};
  if(p.endsWith('/readiness')) return {ready:true,items:[{id:'provider_key',ok:true,label:'Chave do provedor',detail:'OpenRouter conectada',blocking:true},{id:'mission',ok:true,label:'Missão ativa',detail:'2 missões',blocking:true},{id:'handoff',ok:true,label:'Caminho para uma pessoa',detail:'Transferir ligado',blocking:true},{id:'entry',ok:true,label:'Onde atua',detail:'1 número',blocking:false},{id:'eval',ok:false,label:'Avaliação',detail:'Rode a avaliação',blocking:false}]};
  if(p.endsWith('/spend')) return {month_start:now,spent_usd:42.1,has_unknown_cost:false,cap_usd:80,calls:900};
  if(p.endsWith('/block-metrics')) return J('block-metrics.json');
  if(p.endsWith('/diagnostics')) return J('diagnostics.json');
  if(p.endsWith('/versions')) return {versions:[{id:'v14',version:14,status:'active',current:true,created_at:now,summary:['Tom: amigável','Ferramenta: Consultar produto'],note:null,restored_from:null,eval_score:88,eval_grave:0},{id:'v13',version:13,status:'archived',current:false,created_at:now,summary:['Limite: saúde'],note:null,restored_from:null,eval_score:84,eval_grave:0}]};
  if(p.endsWith('/scenarios')) return {scenarios:[]};
  if(p.startsWith('/api/ai/missions')) return {missions:[{id:'m1',event_type:'whatsapp.received',display_name:'Atendimento direto',status:'active',agent_id:'a-duda',objective:'Responder e vender'},{id:'m2',event_type:'flow.cart_abandoned',display_name:'Carrinho abandonado · toque 2',status:'active',agent_id:'a-duda',objective:'Recuperar carrinho'}]};
  if(p==='/api/ai/runtime-mode') return {mode:'runtime'};
  if(p==='/api/whatsapp/business-accounts') return {accounts:[{id:'w1',verified_name:'Loja Demo',display_phone_number:'+55 11 4000-1234'},{id:'w2',verified_name:'Loja Demo',display_phone_number:'+55 11 4000-5678'},{id:'w3',verified_name:'Loja Demo',display_phone_number:'+55 11 4000-9012'}]};
  if(p==='/api/ai/knowledge') return {folders,total:notes.length};
  if(p==='/api/ai/knowledge/gaps') return {gaps:[{id:'g1',question:'O kit presente vem com embalagem e cartão?',count:9,outcome:'answered_without_source',safe:true,agent_ids:['a-duda'],samples:['vem com cartão?'],status:'open'},{id:'g2',question:'Aceitam PIX parcelado?',count:4,outcome:'no_knowledge',safe:true,agent_ids:['a-duda'],status:'open'},{id:'g3',question:'O sérum pode ser usado durante a gravidez?',count:5,outcome:'blocked',safe:false,agent_ids:['a-duda','a-leo'],status:'open'}]};
  if(p==='/api/ai/knowledge/graph') return {nodes:notes.map(n=>({id:n.id,name:n.name,folder:n.folder,readers:n.readers})),edges:[{source:'s3',target:'s2'},{source:'s5',target:'s2'}],agents:list.map(a=>({id:a.id,name:a.name}))};
  if((m=p.match(/^\/api\/ai\/knowledge\/([^/]+)$/))) { const n=notes.find(x=>x.id===m[1])??notes[0]; return {note:{...n,body_markdown:body},backlinks:[{id:'s5',name:'Frete grátis'}]}; }
  if(p.endsWith('/usage')) return {series:[3,5,2,6,4,4,4],total:28,questions:[{question:'Posso trocar se não servir?',agent_name:'Duda',at:now}]};
  if(p==='/api/ai/activity/summary') return J('summary.json');
  if(p==='/api/ai/activity/events') return {events:[{id:'ev1',kind:'sale',agent_id:'a-duda',summary:'Fechou 2 Kits Presente com KIT15',value:143.8,created_at:now,contact_name:'Rafael Menezes'},{id:'ev2',kind:'transfer',agent_id:'a-duda',summary:'Transferiu: pedido de atacado',created_at:now,contact_name:'Paulo Henrique'}]};
  if(p==='/api/ai/alerts') return {alerts:[]};
  if(p.startsWith('/api/ai/evals')) return {runs:[]};
  if(p.startsWith('/api/notifications')) return {notifications:[],unreadCount:0};
  if(p.startsWith('/api/stores')||p.startsWith('/api/shopify')) return {stores:[{id:'st1',name:'Rose & Oliver',domain:'roseoliver.myshopify.com',is_active:true}]};
  return null;
}
