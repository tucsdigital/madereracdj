"use client";

import VisitorsReportChart from "./components/visitors-chart";
import CustomerStatistics from "./components/customer-statistics";
import Transaction from "./components/transaction";
import Orders from "./components/orders";
import TopCountries from "./components/top-countries";
import Products from "./components/products";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import DashboardSelect from "@/components/dasboard-select";
import EcommerceStats from "./components/ecommerce-stats";
import { ScrollArea } from "@/components/ui/scroll-area";
import DashboardDropdown from "@/components/dashboard-dropdown";
import DatePickerWithRange from "@/components/date-picker-with-range";
const Ventas = ({ trans }) => {
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap gap-4 items-center justify-between">
        <div className="text-2xl font-medium text-default-800">
          Ecommerce Dashboard
        </div>
        <DatePickerWithRange />
      </div>
      <Card>
        <CardContent className="p-4">
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
            <EcommerceStats />
          </div>
        </CardContent>
      </Card>
      <div className="grid grid-cols-12 gap-6">
        <div className="col-span-12 lg:col-span-8">
          <Card>
            <CardHeader className=" gap-4 border-none pb-0 mb-0">
              <div className="flex flex-wrap items-center gap-3">
                <CardTitle className="flex-1 whitespace-nowrap">
                  Visitors Report
                </CardTitle>
                <div className="flex-none">
                  <DashboardSelect />
                </div>
              </div>
            </CardHeader>
            <CardContent className="px-4 pt-0">
              <VisitorsReportChart />
            </CardContent>
          </Card>
        </div>
        <div className="col-span-12 lg:col-span-4">
          <CustomerStatistics />
        </div>
      </div>
      <div className="grid grid-cols-12 gap-6">
        <div className="col-span-12 lg:col-span-4">
          <Card>
            <CardHeader className="flex-row justify-between items-center gap-4 mb-0 border-none p-6 pb-4">
              <CardTitle className="whitespace-nowrap">
                Transaction History
              </CardTitle>
              <DashboardDropdown />
            </CardHeader>
            <CardContent className="px-0 pt-0 h-[580px] pb-0">
              <ScrollArea className="h-full">
                <Transaction />
              </ScrollArea>
            </CardContent>
          </Card>
        </div>
        <div className="col-span-12 lg:col-span-8">
          <Orders />
        </div>
      </div>
      <div className="grid grid-cols-12 gap-6">
        <div className="col-span-12 lg:col-span-6">
          <TopCountries />
        </div>
        <div className="col-span-12 lg:col-span-6">
          <Products />
        </div>
      </div>
    </div>
  );
};

export default Ventas;
