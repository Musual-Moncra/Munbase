import {getRequestConfig} from 'next-intl/server';
import {routing} from './routing';

export default getRequestConfig(async ({requestLocale}) => {
  const candidate = await requestLocale;
  const locale = routing.locales.includes(candidate as (typeof routing.locales)[number])
    ? candidate!
    : routing.defaultLocale;
  return {locale, messages: (await import(`../../messages/${locale}.json`)).default};
});
