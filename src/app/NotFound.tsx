import { Link } from 'react-router';
import { t } from '@/i18n';
import { Empty } from '@/ui/controls';
import { PageHeader } from '@/ui/PageHeader';

export function NotFound() {
	return (
		<>
			<PageHeader title={t('notFound.title')} />
			<Empty
				title={t('notFound.text')}
				action={
					<Link to="/" className="btn btn--outline btn--sm">
						{t('notFound.back')}
					</Link>
				}
			/>
		</>
	);
}
