import type { NextRequest, NextResponse } from 'next/server';

import { Config } from './config';
import type { ConfigOptions } from './config';
import {
  createSecret,
  getTokenString,
  createToken,
  verifyToken,
  utoa,
  atou
} from './util';

type CSRFMiddlewareFunction = {
  (request: NextRequest, response: NextResponse): Promise<Error | null>;
};

export default function CreateMiddleware(opts?: Partial<ConfigOptions>): CSRFMiddlewareFunction {
  const config = new Config(opts || {});

  return async (request, response) => {
    let secret: Uint8Array;
    let secretStr: string | undefined;
    
    // check excludePathPrefixes
    for (const pathPrefix of config.excludePathPrefixes) {
      if (request.nextUrl.pathname.startsWith(pathPrefix)) return null;
    }

    // get secret from cookies
    secretStr = request.cookies.get(config.cookie.name)?.value

    // if secret is missing, create new secret and set cookie
    if (secretStr === undefined) {
      secret = createSecret(config.secretByteLength)
      const cookie = Object.assign({value: utoa(secret)}, config.cookie);
      response.cookies.set(cookie);
    } else {
      secret = atou(secretStr)
    }

    // verify token
    if (!config.ignoreMethods.includes(request.method)) {
      const tokenStr = await getTokenString(request, config.token.value)
      // need to be decoded if the token was set in the cookie
      const token = atou(config.useStatic ? decodeURIComponent(tokenStr) : tokenStr);
      if (!await verifyToken(token, secret)) {
        return new Error('csrf validation error')
      }
    }

    // create new token for response
    const newToken = await createToken(secret, config.saltByteLength)
    if (config.useStatic) {
      const newCookie = {
        ...config.cookie, 
        name: config.token.responseHeader, 
        value: utoa(newToken),
        httpOnly: false,
      }
      response.cookies.set(newCookie)
    } else {
      response.headers.set(config.token.responseHeader, utoa(newToken))
    }

    return null
  }
}
