'use client';

interface Props {
  value: string[];
  onChange: (next: string[]) => void;
  disabled?: boolean;
}

const GROUPS: { label: string; events: string[] }[] = [
  { label: 'Pedidos', events: ['order.created', 'order.paid', 'order.fulfilled', 'order.cancelled'] },
  { label: 'Checkout & Pagamento', events: ['checkout.abandoned', 'payment.pix.abandoned', 'payment.boleto.abandoned'] },
  { label: 'Cliente & Comportamento', events: ['customer.created', 'browse.abandoned'] },
  { label: 'Logística', events: ['shipment.tracking_created'] },
];

export default function EventCheckboxGroup({ value, onChange, disabled }: Props) {
  const selected = new Set(value);

  const toggle = (event: string) => {
    const next = new Set(selected);
    if (next.has(event)) next.delete(event);
    else next.add(event);
    onChange(Array.from(next));
  };

  const toggleGroup = (events: string[]) => {
    const allSelected = events.every((e) => selected.has(e));
    const next = new Set(selected);
    if (allSelected) events.forEach((e) => next.delete(e));
    else events.forEach((e) => next.add(e));
    onChange(Array.from(next));
  };

  return (
    <div className="space-y-4">
      {GROUPS.map((group) => {
        const allSelected = group.events.every((e) => selected.has(e));
        const someSelected = group.events.some((e) => selected.has(e));
        return (
          <div key={group.label} className="border border-gray-200 rounded-lg p-3">
            <label className="flex items-center gap-2 font-medium text-gray-800 mb-2 cursor-pointer">
              <input
                type="checkbox"
                checked={allSelected}
                ref={(el) => {
                  if (el) el.indeterminate = someSelected && !allSelected;
                }}
                onChange={() => toggleGroup(group.events)}
                disabled={disabled}
                className="w-4 h-4"
              />
              {group.label}
            </label>
            <div className="pl-6 grid grid-cols-1 sm:grid-cols-2 gap-1">
              {group.events.map((event) => (
                <label key={event} className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={selected.has(event)}
                    onChange={() => toggle(event)}
                    disabled={disabled}
                    className="w-4 h-4"
                  />
                  <code className="font-mono text-xs">{event}</code>
                </label>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
