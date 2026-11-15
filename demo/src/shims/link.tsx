/** Sustituto de next/link: un enlace normal que navega con "#" */
import { AnchorHTMLAttributes } from 'react';

export default function Link({ href, ...resto }: AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }) {
  return <a href={`#${href}`} {...resto} />;
}
