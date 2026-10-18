import React from "react";
import { cn, isLocationMatch, translate, useLocalizedPath } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import Link from "next/link";
import { ChevronRight, ChevronLeft } from "lucide-react";
import { useThemeStore } from "@/store";
import { isMenuActive } from "@/lib/menu-location";

function NavLink({ childItem, locationName, trans }) {
  const { href, icon, title, badge } = childItem;
  const localize = useLocalizedPath();
  return (
    <Link
      href={localize(href)}
      aria-current={isMenuActive(childItem, locationName) ? "page" : undefined}
      className={cn(
        "flex  font-medium  text-sm capitalize px-[10px] py-3 gap-3 rounded-md cursor-pointer",
        {
          "bg-primary text-primary-foreground": isMenuActive(childItem, locationName),
          " text-default-600": !isMenuActive(childItem, locationName),
        }
      )}
    >
      {icon && (
        <span className="inline-flex items-center   grow-0">
          <childItem.icon className=" h-5 w-5" />
        </span>
      )}
      <div className="grow truncate">{translate(title, trans)}</div>
      {badge && <Badge className="rounded h-min ">{badge}</Badge>}
    </Link>
  );
}

const MenuItem = ({
  childItem,
  toggleNested,
  nestedIndex,
  index,
  locationName,
  trans,
}) => {
  const { icon, title } = childItem;
  const { isRtl } = useThemeStore();
  return (
    <div>
      {childItem?.nested ? (
        <div
          className={cn("flex items-center gap-3 px-[10px] py-3 rounded-md ", {
            "bg-primary  text-primary-foreground": nestedIndex === index,
            "  text-default-600": nestedIndex !== index,
          })}
        >
          <div
            className={cn(
              "flex  font-medium  text-sm capitalize  gap-3 cursor-pointer flex-1 "
            )}
            onClick={() => toggleNested(index)}
          >
            <span className="inline-flex items-center  grow-0">
              <childItem.icon className=" h-5 w-5" />
            </span>
            <span className="grow truncate">
              {translate(title, trans)}
            </span>
          </div>
          {childItem.nested && (
            <div
              className={cn(
                "flex-none transition-all duration-200 text-default-500 ",
                {
                  " transform rotate-90   text-primary-foreground":
                    nestedIndex === index,
                }
              )}
            >
              {isRtl ? (
                <ChevronLeft className="w-3.5 h-3.5 " />
              ) : (
                <ChevronRight className="w-3.5 h-3.5 " />
              )}
            </div>
          )}
        </div>
      ) : (
        <div className=" flex-1">
          <NavLink
            childItem={childItem}
            locationName={locationName}
            trans={trans}
          />
        </div>
      )}
    </div>
  );
};

export default MenuItem;
