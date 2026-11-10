import React from "react";
import { cn, translate } from "@/lib/utils";

const MenuLabel = ({ item, className, trans }) => {
  const { title } = item;
  return (
    <div
      className={cn(
        "mt-6 mb-2 px-3 text-sm font-medium tracking-normal text-muted-foreground",
        className
      )}
    >
      {translate(title, trans)}
    </div>
  );
};

export default MenuLabel;
