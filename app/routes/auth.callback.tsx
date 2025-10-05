// app/routes/auth.callback.tsx
import { type LoaderFunctionArgs, redirect } from '@remix-run/node';
import { createCookieSessionStorage } from '@remix-run/node';

// Create session storage for auth tokens
const sessionStorage = createCookieSessionStorage({
  cookie: {
    name: '__convex_auth',
    httpOnly: true,
    path: '/',
    sameSite: 'lax',
    secrets: [globalThis.process.env.SESSION_SECRET || 'fallback-secret-change-in-prod'],
    secure: process.env.NODE_ENV === 'production',
    maxAge: 60 * 60 * 24 * 7, // 7 days
  },
});

export async function loader({ request }: LoaderFunctionArgs) {
  const url = new URL(request.url);
  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  const error = url.searchParams.get('error');

  // Handle OAuth errors
  if (error) {
    console.error('OAuth error:', error);
    return redirect('/?auth_error=' + encodeURIComponent(error));
  }

  // Validate required parameters
  if (!code) {
    console.error('Missing OAuth code');
    return redirect('/?auth_error=missing_code');
  }

  try {
    // Exchange code for tokens with WorkOS - using globalThis.process.env for server-side variables
    const clientId = globalThis.process.env.WORKOS_CLIENT_ID || process.env.VITE_WORKOS_CLIENT_ID;
    const clientSecret = globalThis.process.env.WORKOS_API_KEY;
    const redirectUri = globalThis.process.env.WORKOS_REDIRECT_URI || process.env.VITE_WORKOS_REDIRECT_URI;
    const apiHostname = process.env.VITE_WORKOS_API_HOSTNAME || 'apiauth.convex.dev';

    if (!clientId) {
      throw new Error('Missing WORKOS_CLIENT_ID');
    }

    if (!clientSecret) {
      throw new Error('Missing WORKOS_API_KEY');
    }

    const tokenResponse = await fetch(`https://${apiHostname}/user_management/authenticate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        client_id: clientId,
        client_secret: clientSecret,
        code: code,
        grant_type: 'authorization_code',
        redirect_uri: redirectUri,
      }),
    });

    if (!tokenResponse.ok) {
      const errorData = await tokenResponse.text();
      console.error('Token exchange failed:', tokenResponse.status, errorData);
      return redirect('/?auth_error=token_exchange_failed');
    }

    const tokens = await tokenResponse.json();
    
    console.log('Token exchange successful, access_token length:', tokens.access_token?.length);
    
    // Store the access token in a secure session cookie
    const session = await sessionStorage.getSession(request.headers.get('Cookie'));
    session.set('convex_auth_token', tokens.access_token);
    session.set('refresh_token', tokens.refresh_token);
    session.set('user', tokens.user);

    const cookieHeader = await sessionStorage.commitSession(session);
    console.log('Setting cookie header:', cookieHeader.substring(0, 100) + '...');

    // Redirect back to home with the session cookie
    return redirect('/', {
      headers: {
        'Set-Cookie': cookieHeader,
      },
    });
  } catch (error) {
    console.error('OAuth callback error:', error);
    return redirect('/?auth_error=unexpected_error');
  }
}
