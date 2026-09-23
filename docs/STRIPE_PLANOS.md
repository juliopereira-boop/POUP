# Stripe — Start e Pro

Oferta atual: **Start R$ 29,90/mês** e **Pro R$ 59,90/mês**, em BRL. Pro acrescenta vendas/comissões; LIA somente na web compatível. Intermed saiu do produto. O app nativo permanece complementar, sem checkout externo ou chamada para assinar.

## Preparação

Esta entrega considera a confirmação de que não existem clientes em produção. Se forem encontradas assinaturas antigas, pare a implantação e revise a transição; não apague dados para fazer a migration passar. Teste primeiro com Stripe de teste e Supabase local/homologação. Confirme o projeto alvo, backup e versões implantadas; não use `db reset` remoto.

Aplique as migrations pendentes revisadas, incluindo `20260916031259_planos_start_pro.sql`, **antes do webhook novo**. Ela depende das anteriores, inclusive `0033_exclusao_pendente.sql`.

## Catálogo e configuração

Crie preços recorrentes mensais em BRL, quantidade 1:

| Plano | Centavos | Secret Supabase | Variável web |
| --- | --- | --- | --- |
| Start | 2990 | STRIPE_PRICE_START
| Pro   | 5990 | STRIPE_PRICE_PRO

Se existe Pro de R$ 89,90, crie **outro Price**. Alterar o texto não altera a cobrança. Retire Intermed e o Pro anterior da oferta e do Customer Portal, sem apagar histórico.

Configure também `STRIPE_SECRET_KEY` e `STRIPE_WEBHOOK_SECRET` no Supabase. Nunca coloque chaves privadas em `EXPO_PUBLIC_*` ou no Git. Remova as variáveis Intermed dos ambientes na implantação.

Publique `create-checkout-session`, `stripe-webhook` e `delete-account`. As funções permanecem autocontidas para publicação pela CLI ou pelo Dashboard. O webhook deve receber `checkout.session.completed` e `customer.subscription.created/updated/deleted` em `https://<project-ref>.supabase.co/functions/v1/stripe-webhook`.

Desative a verificação JWT **do gateway desse webhook**: sua autenticação é a assinatura Stripe validada pelo código. Não remova autenticação dos endpoints de usuário. Copie o signing secret do endpoint e modo corretos.

O checkout valida valor, moeda, recorrência e preço ativo. O webhook consulta o estado atual no Stripe e grava pela RPC `sync_billing_subscription`, exclusiva de `service_role`. Preço desconhecido ou falha no banco retorna erro para retry, nunca um downgrade silencioso. Eventos mais antigos não sobrescrevem eventos novos no banco. Monitore e reconcilie falhas; sucesso no checkout não comprova atualização dos direitos.

## Portal e frontend

No Customer Portal, habilite atualização/cancelamento e ofereça **somente os dois preços atuais**. Defina e teste as regras de rateio e a data de efetivação da troca. Assinantes usam **Gerenciar assinatura**, não outro checkout. O servidor verifica assinaturas existentes e reutiliza checkout aberto compatível.

Os Price IDs ficam exclusivamente nos secrets das Supabase Edge Functions.
A web envia apenas o identificador lógico do plano, como "start" ou "pro". As variáveis públicas são incorporadas no bundle: faça novo build/deploy. O app de loja não precisa dos IDs. A elegibilidade do modelo complementar deve ser confirmada na revisão Apple; esconder preços não garante aprovação.

## Aceite em ambiente de teste

1. Comprar Start e Pro; conferir valor, moeda, período, `plan_tier`, status e cotas.
2. Repetir clique e evento; conferir ausência de assinatura duplicada. Testar evento atrasado.
3. Enviar preço Intermed/desconhecido/antigo; confirmar recusa sem cobrança.
4. Simular indisponibilidade do banco e conferir retry do webhook.
5. Trocar plano pelo portal, cancelar e simular inadimplência; conferir os direitos.
6. Excluir conta ativa/inativa; conferir cancelamento, arquivos, revogação Apple e ausência de cobrança residual.

## Reversão

Pause novas contratações em caso de divergência. Reverta frontend/funções de forma coordenada, preservando banco e preços já usados. Não restaure um webhook que transforma preço desconhecido em Start. Com clientes reais, qualquer mudança de preço exige plano de transição próprio.

Referências: [preços Stripe](https://docs.stripe.com/products-prices/manage-prices), [webhooks](https://docs.stripe.com/webhooks), [migrations Supabase](https://supabase.com/docs/guides/deployment/database-migrations), [diretrizes Apple](https://developer.apple.com/app-store/review/guidelines/).
