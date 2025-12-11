"use client";
import { Bell } from "@/components/svg";
import { AlertTriangle, Package, ChevronDown, ChevronUp } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ScrollArea } from "@/components/ui/scroll-area";
import Link from "next/link";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";
import { useStockNotifications } from "@/hooks/useStockNotifications";
import shortImage from "@/public/images/all-img/short-image-2.png";
import { useState } from "react";
import { useRouter } from "next/navigation";

const NotificationMessage = () => {
  const { notifications, loading } = useStockNotifications();
  const [showAll, setShowAll] = useState(false);
  const router = useRouter();

  // Mostrar máximo 6 productos inicialmente
  const PRODUCTOS_VISIBLES = 6;
  const productosVisibles = showAll 
    ? notifications 
    : notifications.slice(0, PRODUCTOS_VISIBLES);
  const hayMasProductos = notifications.length > PRODUCTOS_VISIBLES;

  // Formatear fecha relativa
  const formatearFecha = () => {
    return new Date().toLocaleTimeString("es-AR", { 
      hour: "2-digit", 
      minute: "2-digit" 
    });
  };

  // Navegar a la página de stock
  const handleVerProducto = (productoId) => {
    router.push(`/stock-compras?producto=${productoId}`);
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="relative md:h-9 md:w-9 h-8 w-8 hover:bg-default-100 dark:hover:bg-default-200 
          data-[state=open]:bg-default-100  dark:data-[state=open]:bg-default-200 
           hover:text-primary text-default-500 dark:text-default-800  rounded-full  "
        >
          <Bell className="h-5 w-5 " />
          {notifications.length > 0 && (
            <Badge className=" w-4 h-4 p-0 text-xs  font-medium  items-center justify-center absolute left-[calc(100%-18px)] bottom-[calc(100%-16px)] ring-2 ring-primary-foreground bg-red-500 text-white">
              {notifications.length > 99 ? "99+" : notifications.length}
            </Badge>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        alignOffset={-16}
        sideOffset={8}
        avoidCollisions={true}
        className="z-999 w-[min(412px,calc(100vw-2rem))] max-w-[calc(100vw-2rem)] p-0"
      >
        <DropdownMenuLabel
          style={{ backgroundImage: `url(${shortImage.src})` }}
          className="w-full h-full bg-cover bg-no-repeat p-4 flex items-center"
        >
          <span className="text-base font-semibold text-white flex-1">
            Notificaciones de Stock
          </span>
          {notifications.length > 0 && (
            <span className="text-xs font-medium text-white/90">
              {notifications.length} {notifications.length === 1 ? "producto" : "productos"}
            </span>
          )}
        </DropdownMenuLabel>
        <div className="h-[300px] xl:h-[350px]">
          {loading ? (
            <div className="flex items-center justify-center h-full">
              <div className="flex flex-col items-center gap-2">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
                <p className="text-sm text-default-600">Cargando notificaciones...</p>
              </div>
            </div>
          ) : notifications.length === 0 ? (
            <div className="flex items-center justify-center h-full">
              <div className="flex flex-col items-center gap-2 text-center px-4">
                <Package className="h-12 w-12 text-default-400" />
                <p className="text-sm font-medium text-default-900">Sin notificaciones</p>
                <p className="text-xs text-default-600">Todos los productos tienen stock disponible</p>
              </div>
            </div>
          ) : (
            <ScrollArea className="h-full [&_[data-radix-scroll-area-viewport]>div]:!flex [&_[data-radix-scroll-area-viewport]>div]:!flex-col">
              {productosVisibles.map((producto, index) => (
                  <DropdownMenuItem
                    key={`stock-notification-${producto.id}-${index}`}
                    className="!flex gap-3 py-3 px-4 cursor-pointer dark:hover:bg-background hover:bg-default-50 transition-colors"
                    onClick={() => handleVerProducto(producto.id)}
                  >
                  <div className="flex-1 flex items-start gap-3 min-w-0">
                    <Avatar className="h-10 w-10 rounded flex-shrink-0">
                      <AvatarFallback className={cn(
                        "text-white font-semibold",
                        producto.sinStock 
                          ? "bg-red-500" 
                          : "bg-orange-500"
                      )}>
                        {producto.sinStock ? (
                          <AlertTriangle className="h-5 w-5" />
                        ) : (
                          <Package className="h-5 w-5" />
                        )}
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2 mb-1">
                        <div className="text-sm font-semibold text-default-900 truncate flex-1">
                          {producto.nombre}
                        </div>
                        {producto.stockBajo && !producto.sinStock && (
                          <Badge variant="outline" className="text-xs flex-shrink-0 flex items-center justify-center bg-orange-50 text-orange-700 border-orange-200">
                            Stock bajo
                          </Badge>
                        )}
                      </div>
                      <div className="text-xs text-default-600 space-y-0.5">
                        <div className="flex items-center gap-2">
                          <span className={cn(
                            "font-medium",
                            producto.sinStock ? "text-red-600" : "text-orange-600"
                          )}>
                            {producto.sinStock 
                              ? "Sin stock disponible" 
                              : producto.stockBajo
                              ? `Stock bajo (faltan ${producto.faltante} ${producto.unidad || "unidades"})`
                              : "Stock bajo"
                            }
                          </span>
                        </div>
                        <div className="flex items-center gap-3 text-default-500">
                          <span>Stock: <strong>{producto.stockDisponible}</strong></span>
                          {producto.stockMinimo > 0 && (
                            <>
                              <span>•</span>
                              <span>Mínimo: <strong>{producto.stockMinimo}</strong></span>
                            </>
                          )}
                        </div>
                        {producto.categoria && (
                          <div className="text-default-500">
                            {producto.categoria}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-1 flex-shrink-0">
                    <div className="text-xs font-medium text-default-500 whitespace-nowrap">
                      {formatearFecha()}
                    </div>
                    <div
                      className={cn("w-2 h-2 rounded-full", {
                        "bg-red-500": producto.sinStock,
                        "bg-orange-500": !producto.sinStock,
                      })}
                    ></div>
                  </div>
                </DropdownMenuItem>
              ))}
              
              {/* Botón "Ver más" / "Ver menos" */}
              {hayMasProductos && (
                <div className="px-4 py-2 border-t border-default-200">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="w-full text-xs text-primary hover:text-primary/80 flex items-center justify-center"
                    onClick={(e) => {
                      e.stopPropagation();
                      setShowAll(!showAll);
                    }}
                  >
                    {showAll ? (
                      <>
                        <ChevronUp className="h-4 w-4 mr-1" />
                        Ver menos
                      </>
                    ) : (
                      <>
                        <ChevronDown className="h-4 w-4 mr-1" />
                        Ver más ({notifications.length - PRODUCTOS_VISIBLES} más)
                      </>
                    )}
                  </Button>
                </div>
              )}
            </ScrollArea>
          )}
        </div>
        <DropdownMenuSeparator />
        <div className="m-4 mt-5">
          <Button asChild variant="outline" className="w-full">
            <Link href="/stock-compras">
              Ver Gestión de Stock
            </Link>
          </Button>
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
};

export default NotificationMessage;
