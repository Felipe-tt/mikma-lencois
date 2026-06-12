import { OrdersListSkeleton } from '@/components/ui/Skeleton';
export default function Loading() {
  return (
    <div className="border-b border-mist">
      <div className="container-shop py-12">
        <OrdersListSkeleton />
      </div>
    </div>
  );
}
