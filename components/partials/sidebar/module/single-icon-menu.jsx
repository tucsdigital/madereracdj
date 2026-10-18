import React from "react";
import { cn } from "@/lib/utils";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
  TooltipArrow,
} from "@/components/ui/tooltip";
import Link from "next/link";
import { translate } from "@/lib/utils";
import { useLocalizedPath } from "@/lib/utils";
import { isMenuActive } from "@/lib/menu-location";
const SingleIconMenu = ({ index, activeIndex, item, locationName, trans }) => {
  const { icon, title, href } = item;
  const localize = useLocalizedPath();
  const active = isMenuActive(item, locationName);
  return (
    <>
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            {href ? (
              <Link
                href={localize(href)}
                aria-label={translate(title, trans)}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "h-12 w-12 mx-auto rounded-md  transition-all duration-300 flex flex-col items-center justify-center cursor-pointer relative",
                  {
                    "bg-primary/10  text-primary": active,
                    "text-default-500 dark:text-default-400 hover:bg-primary/10  hover:text-primary ":
                      !active,
                  }
                )}
              >
                <item.icon className="w-6 h-6" />
              </Link>
            ) : (
              <button
                type="button"
                aria-label={translate(title, trans)}
                aria-expanded={activeIndex === index}
                className={cn(
                  "h-12 w-12 mx-auto rounded-md transition-all duration-300 flex flex-col items-center justify-center cursor-pointer relative  ",
                  {
                    "bg-primary/10 dark:bg-primary dark:text-primary-foreground  text-primary data-[state=delayed-open]:bg-primary/10 ":
                      activeIndex === index,
                    " text-default-500 dark:text-default-400 data-[state=delayed-open]:bg-primary/10  data-[state=delayed-open]:text-primary":
                      activeIndex !== index,
                  }
                )}
              >
                <item.icon className="w-6 h-6" />
              </button>
            )}
          </TooltipTrigger>
          <TooltipContent side="right" className=" capitalize">
            {translate(title, trans)}
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    </>
  );
};

export default SingleIconMenu;
