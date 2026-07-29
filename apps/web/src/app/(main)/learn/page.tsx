import { LearnIcon } from '@/components/icons/nav-icons';
import { ComingSoon } from '@/components/ui/coming-soon';

export default function LearnPage() {
  return (
    <ComingSoon
      icon={LearnIcon}
      title="Изучение"
      description="Режим обучения по Ветхому и Новому Завету, книгам, главам, темам и уровням сложности."
    />
  );
}
