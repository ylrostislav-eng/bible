import { TournamentIcon } from '@/components/icons/nav-icons';
import { ComingSoon } from '@/components/ui/coming-soon';

export default function TournamentsPage() {
  return (
    <ComingSoon
      icon={TournamentIcon}
      title="Турниры"
      description="Регулярные турниры с призами появятся на одном из следующих этапов."
    />
  );
}
