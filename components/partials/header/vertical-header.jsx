import { useThemeStore } from "@/store";
import { useLocalizedPath } from "@/lib/utils";
import { Search } from "lucide-react";
import { SiteLogo } from "@/components/svg";
import Link from "next/link";
import { useMediaQuery } from "@/hooks/use-media-query";

const VerticalHeader = () => {
  const { layout } = useThemeStore();
  const isDesktop = useMediaQuery("(min-width: 1280px)");
  const localize = useLocalizedPath();
  const showLogo = layout === "semibox" && !isDesktop;

  return (
    <div className="flex min-w-0 flex-1 items-center gap-4">
      {showLogo && (
        <Link
          href={localize("/dashboard")}
          aria-label="Ir al panel principal"
          className="inline-flex h-8 shrink-0 items-center"
        >
          <SiteLogo
            width={672}
            height={507}
            alt="Maderas Caballero"
            className="block h-7 w-auto shrink-0 object-contain"
          />
        </Link>
      )}
      {isDesktop ? (
        <button
          type="button"
          disabled
          aria-label="Búsqueda temporalmente desactivada"
          title="Búsqueda temporalmente desactivada"
          className="flex h-10 w-full max-w-[552px] cursor-not-allowed items-center gap-3 rounded-full border border-border/70 bg-background px-4 text-sm text-muted-foreground opacity-60 shadow-sm transition-colors disabled:hover:bg-background"
        >
          <Search aria-hidden="true" className="h-4 w-4 shrink-0" />
          <span className="truncate text-left">Búsqueda temporalmente desactivada</span>
        </button>
      ) : (
        <button
          type="button"
          disabled
          aria-label="Búsqueda temporalmente desactivada"
          title="Búsqueda temporalmente desactivada"
          className="inline-flex h-10 w-10 shrink-0 cursor-not-allowed items-center justify-center rounded-full text-muted-foreground opacity-60 transition-colors disabled:hover:bg-transparent"
        >
          <Search aria-hidden="true" className="h-5 w-5" />
        </button>
      )}
    </div>
  );
};

export default VerticalHeader;
