import createMiddleware from 'next-intl/middleware';
import {routing} from './i18n/routing';

export default createMiddleware(routing);

export const config = {
  // Auth callbacks must reach the Route Handler without next-intl prefixing
  // `/auth/callback` into a localized page path.
  matcher: '/((?!api|auth|_next|.*\\..*).*)'
};
