import Link from "next/link";

type DivisionMobileSubnavProps = {
  seasonId: number;
  divisionId: number;
  items?: Array<{
    href: string;
    label: string;
  }>;
};

export function DivisionMobileSubnav({
  seasonId,
  divisionId,
  items,
}: DivisionMobileSubnavProps) {
  const defaultItems = [
    { href: "#standings", label: "Standings" },
    { href: "#leaders", label: "Leaders" },
    { href: "#schedule", label: "Schedule" },
    { href: `/seasons/${seasonId}/divisions/${divisionId}/transactions`, label: "Tx" },
    { href: `/seasons/${seasonId}/divisions/${divisionId}/rosters`, label: "Rosters" },
  ];

  return (
    <div className="mobile-section-nav md:hidden">
      <div className="flex gap-2 overflow-x-auto px-4 py-2 scrollbar-thin">
        {(items ?? defaultItems).map((item) =>
          item.href.startsWith("#") ? (
            <a key={item.href} href={item.href} className="mobile-section-nav-item">
              {item.label}
            </a>
          ) : (
            <Link key={item.href} href={item.href} className="mobile-section-nav-item">
              {item.label}
            </Link>
          )
        )}
      </div>
    </div>
  );
}
