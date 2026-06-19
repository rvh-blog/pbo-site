export default function Overlay2Layout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      <style
        dangerouslySetInnerHTML={{
          __html: `
            html, body {
              background: #020617 !important;
              margin: 0 !important;
              padding: 0 !important;
              overflow: hidden !important;
            }
            .pokeball-bg,
            .pokeball-wireframe,
            nav,
            footer {
              display: none !important;
            }
            main.container {
              padding: 0 !important;
              margin: 0 !important;
              max-width: none !important;
            }
          `,
        }}
      />
      {children}
    </>
  );
}
