import { Fragment } from "react";
import { useResponsiveColumns } from "./components/columns";
import { DataTable } from "./components/data-table";

export { useResponsiveColumns as columns, DataTable };

export default function AdvancedTable() {
  const columns = useResponsiveColumns();
  return (
    <Fragment>
      <DataTable columns={columns} />
    </Fragment>
  );
}
