import { RatingIcon } from '@/components/icons/nav-icons';
import { ComingSoon } from '@/components/ui/coming-soon';

export default function RatingPage() {
  return (
    <ComingSoon
      icon={RatingIcon}
      title="Рейтинг"
      description="Общий, недельный, месячный рейтинги, а также рейтинги по книгам, друзьям и странам."
    />
  );
}
