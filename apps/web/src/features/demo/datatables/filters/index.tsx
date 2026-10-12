// Component Imports
import { Card } from "@/components/ui/card";
import DataTableFilters, { type Item } from "./filters-datatable";

const productData: Item[] = [
  {
    id: "1",
    product: "Black Chair",
    fallback: "BC",
    price: 159,
    availability: "In Stock",
    rating: 3.9,
  },
  {
    id: "2",
    product: "Nike Jordan",
    fallback: "NJ",
    price: 599,
    availability: "Limited",
    rating: 4.4,
  },
  {
    id: "3",
    product: "OnePlus 7 Pro",
    fallback: "O7P",
    price: 1299,
    availability: "Out of Stock",
    rating: 3.5,
  },
  {
    id: "4",
    product: "Nintendo Switch",
    fallback: "NS",
    price: 499,
    availability: "In Stock",
    rating: 4.9,
  },
  {
    id: "5",
    product: "Apple magic mouse",
    fallback: "AMM",
    price: 970,
    availability: "Limited",
    rating: 4.1,
  },
  {
    id: "6",
    product: "Apple watch",
    fallback: "AW",
    price: 1500,
    availability: "Limited",
    rating: 3.1,
  },
  {
    id: "7",
    product: "Casio G-Shock",
    fallback: "CGS",
    price: 194,
    availability: "Out of Stock",
    rating: 1.5,
  },
  {
    id: "8",
    product: "RayBan Sunglasses",
    fallback: "RBS",
    price: 199,
    availability: "Out of Stock",
    rating: 2.4,
  },
];

const DataTableWithFilters = () => {
  return (
    <Card className="py-0">
      <DataTableFilters data={productData} />
    </Card>
  );
};

export default DataTableWithFilters;
