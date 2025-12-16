# Atualização: Selects Dinâmicos para Automações

## O que mudou

O arquivo `src/components/automation/index.tsx` foi atualizado para:

### ✅ Selects Dinâmicos
Agora ao configurar nodes de pipeline, você **seleciona de uma lista** ao invés de digitar IDs manualmente:

| Node | Campos com Select |
|------|-------------------|
| **Deal Criado** | Pipeline |
| **Deal Mudou Estágio** | Pipeline + Estágio |
| **Deal Ganho** | Pipeline |
| **Deal Perdido** | Pipeline |
| **Criar Deal** | Pipeline + Estágio |
| **Mover Deal** | Pipeline + Estágio |
| **Atribuir Deal** | Usuário |

### 🔄 Como funciona
1. O componente busca o `organization_id` do localStorage (auth-storage)
2. Faz chamada `GET /api/deals?type=pipelines&organizationId=xxx`
3. Popula os selects com os dados retornados
4. Ao selecionar uma pipeline, os estágios dela aparecem automaticamente

### 📝 Campos por Node

**Triggers:**
- `trigger_deal_created`: Pipeline (opcional)
- `trigger_deal_stage`: Pipeline (opcional) + Estágio de destino (opcional)
- `trigger_deal_won`: Pipeline (opcional) + Valor mínimo (opcional)
- `trigger_deal_lost`: Pipeline (opcional) + Motivo de perda (opcional)

**Actions:**
- `action_create_deal`: Pipeline* + Estágio* + Título + Valor
- `action_move_deal`: Pipeline (opcional) + Estágio de destino*
- `action_assign_deal`: Usuário*

**Outros:**
- `trigger_tag`: Nome da tag
- `trigger_webhook`: Mostra URL para copiar
- `action_webhook`: URL + Método
- `action_notify`: Título + Mensagem
- `action_update`: Campo + Novo valor

---

**Arquivo modificado:**
- `src/components/automation/index.tsx`

**Apenas substitua este arquivo no seu projeto!**
