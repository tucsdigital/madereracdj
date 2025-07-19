import * as React from "react";
import { Check, ChevronsUpDown } from "lucide-react";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

const Autocomplete = React.forwardRef(
  (
    {
      label,
      className,
      children,
      labelClass,
      value,
      onValueChange,
      placeholder = "Seleccionar...",
      ...props
    },
    ref
  ) => {
    const [open, setOpen] = React.useState(false);
    // Buscar el label del item seleccionado
    let selectedLabel = placeholder;
    React.Children.forEach(children, (child) => {
      if (child && child.props && child.props.value === value) {
        selectedLabel = child.props.children;
      }
    });

    const handleSelect = (newValue, newLabel) => {
      if (onValueChange) onValueChange(newValue);
      setOpen(false);
    };

    return (
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="outline"
            role="combobox"
            aria-expanded={open}
            className={cn("w-full justify-between", labelClass)}
          >
            {selectedLabel}
            <ChevronsUpDown className="me-2 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[500px] p-0" align="start">
          <Command>
            <CommandInput placeholder={`Buscar ${label ? label.toLowerCase() : ''}...`} />
            <CommandEmpty>No se encontró ningún cliente.</CommandEmpty>
            <CommandGroup>
              {React.Children.map(children, (child) =>
                React.cloneElement(child, {
                  onSelect: handleSelect,
                  isSelected: child.props.value === value,
                })
              )}
            </CommandGroup>
          </Command>
        </PopoverContent>
      </Popover>
    );
  }
);
Autocomplete.displayName = "Autocomplete";

const AutocompleteItem = React.forwardRef(
  ({ children, value, onSelect, isSelected, ...props }, ref) => {
    const handleItemClick = () => {
      onSelect(value, children);
    };

    return (
      <CommandItem onSelect={handleItemClick} ref={ref} {...props}>
        {children}
        <Check
          className={cn(
            "mr-2 h-4 w-4 me-auto",
            isSelected ? "opacity-100" : "opacity-0"
          )}
        />
      </CommandItem>
    );
  }
);
AutocompleteItem.displayName = "AutocompleteItem";
export { Autocomplete, AutocompleteItem };
