import { FriendsIcon } from '@/components/icons/nav-icons';
import { ComingSoon } from '@/components/ui/coming-soon';

export default function FriendsPage() {
  return (
    <ComingSoon
      icon={FriendsIcon}
      title="Друзья"
      description="Поиск по никнейму, Telegram-username, ссылке-приглашению и QR-коду появится здесь."
    />
  );
}
