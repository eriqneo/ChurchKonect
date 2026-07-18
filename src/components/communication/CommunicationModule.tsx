import { NotificationSystem } from './NotificationSystem';

interface CommunicationModuleProps {
  onActiveTabChange?: (tab: string) => void;
}

export function CommunicationModule({ onActiveTabChange }: CommunicationModuleProps) {
  return (
    <NotificationSystem
      onActiveTabChange={onActiveTabChange}
    />
  );
}
