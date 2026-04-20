import WebhookForm from '@/components/webhooks/WebhookForm';

export default function NewWebhookPage() {
  return (
    <div>
      <div className="px-6 pt-6">
        <h1 className="text-2xl font-semibold text-gray-900">Novo webhook</h1>
      </div>
      <WebhookForm />
    </div>
  );
}
