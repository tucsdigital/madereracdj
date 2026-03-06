import React from "react";
import { SiteLogo } from "@/components/svg";
import Link from "next/link";
import { useLocalizedPath } from "@/lib/utils";

const HorizontalHeader = () => {
  const localize = useLocalizedPath();
  return (
    <div className="flex items-center lg:gap-12 gap-3">
      <div>
        <Link
          href={localize("/dashboard")}
          className="text-primary flex items-center gap-2"
        >
          <SiteLogo className="h-7 w-7" />
          <span className="text-xl font-semibold lg:inline-block hidden">
            {" "}
            DashTail
          </span>
        </Link>
      </div>
    </div>
  );
};

export default HorizontalHeader;
