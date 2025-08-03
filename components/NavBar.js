// components/NavBar.js
import Link from 'next/link';
import { useRouter } from 'next/router';

const tabs = [
  { href: '/', label: 'Home' },
  { href: '/contacts', label: 'Contacts' },
  { href: '/campaigns', label: 'Campaigns' },
  { href: '/connect-freshbooks', label: 'Connect FreshBooks' },
];

export default function NavBar() {
  const { pathname } = useRouter();

  return (
    <header style={S.header}>
      <div style={S.inner}>
        <Link href="/" style={S.brand}>ClientReach</Link>
        <nav style={S.nav}>
          {tabs.map(t => {
            const active = pathname === t.href;
            return (
              <Link key={t.href} href={t.href} style={active ? S.linkActive : S.link}>
                {t.label}
              </Link>
            );
          })}
        </nav>
      </div>
    </header>
  );
}

const S = {
  header: { borderBottom: '1px solid #e5e7eb', background: '#fff' },
  inner: { maxWidth: 1100, margin: '0 auto', padding: '10px 16px',
           display: 'flex', alignItems: 'center', justifyContent: 'space-between' },
  brand: { fontWeight: 700, color: '#0f172a', textDecoration: 'none' },
  nav: { display: 'flex', gap: 14 },
  link: { padding: '6px 10px', borderRadius: 8, color: '#0f172a', textDecoration: 'none' },
  linkActive: { padding: '6px 10px', borderRadius: 8, background: '#0f172a', color: '#fff', textDecoration: 'none' },
};
