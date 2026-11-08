/**
 * The owner's magic link. The token goes in the URL fragment (`/owner#<token>`), which browsers never
 * send to a server, so it stays out of CDN, load balancer and proxy logs and out of Referer headers.
 */
export function ownerLink(webBaseUrl: string, token: string): string {
  return `${webBaseUrl.replace(/\/$/, '')}/owner#${token}`;
}
