import * as Dropdown from '@radix-ui/react-select';
import { Check, ChevronDown } from 'lucide-react';
export function Select({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: [string, string][];
}) {
  return (
    <Dropdown.Root value={value} onValueChange={onChange}>
      <Dropdown.Trigger className="custom-select" aria-label={label}>
        <Dropdown.Value />
        <Dropdown.Icon>
          <ChevronDown size={14} />
        </Dropdown.Icon>
      </Dropdown.Trigger>
      <Dropdown.Portal>
        <Dropdown.Content className="dropdown-content" position="popper" sideOffset={5}>
          <Dropdown.ScrollUpButton>↑</Dropdown.ScrollUpButton>
          <Dropdown.Viewport>
            {options.map(([v, l]) => (
              <Dropdown.Item key={v} value={v} className="dropdown-item">
                <Dropdown.ItemText>{l}</Dropdown.ItemText>
                <Dropdown.ItemIndicator>
                  <Check size={14} />
                </Dropdown.ItemIndicator>
              </Dropdown.Item>
            ))}
          </Dropdown.Viewport>
          <Dropdown.ScrollDownButton>↓</Dropdown.ScrollDownButton>
        </Dropdown.Content>
      </Dropdown.Portal>
    </Dropdown.Root>
  );
}
