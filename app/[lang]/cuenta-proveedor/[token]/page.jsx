import PublicProviderStatement from "./public-provider-statement";

export const dynamic = "force-dynamic";
export const metadata = {
  title: "Estado de cuenta de proveedor",
  robots: { index: false, follow: false, noarchive: true },
  referrer: "no-referrer",
};

export default function PublicProviderStatementPage({ params }) {
  return <PublicProviderStatement token={params?.token || ""} />;
}
