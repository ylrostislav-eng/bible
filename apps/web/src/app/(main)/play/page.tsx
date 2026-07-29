import { PlayIcon } from '@/components/icons/nav-icons';
import { ComingSoon } from '@/components/ui/coming-soon';

export default function PlayPage() {
  return (
    <ComingSoon
      icon={PlayIcon}
      title="Играть"
      description="Одиночная игра, дуэли и комнаты появятся здесь на следующем этапе разработки."
    />
  );
}
