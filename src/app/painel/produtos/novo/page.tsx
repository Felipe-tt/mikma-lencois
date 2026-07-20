import ProductForm from '@/components/seller/ProductForm';

export default function NovoProdutoPage() {
  return (
    <div className="max-w-4xl">
      <div className="mb-7">
        <p className="text-[11px] font-bold tracking-[0.2em] uppercase text-clay-l mb-1">Catálogo</p>
        <h1 className="font-display font-normal text-ink text-2xl">Novo produto</h1>
        <p className="text-[12px] text-faint mt-1">Tire uma foto do produto para começar</p>
      </div>
      <ProductForm />
    </div>
  );
}
