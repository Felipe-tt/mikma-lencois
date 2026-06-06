'use client';
import Image from 'next/image';
import { useState } from 'react';

interface Props {
  images: string[];
  name: string;
  tag?: string;
}

export function ProductGallery({ images, name, tag }: Props) {
  const [active, setActive] = useState(0);

  return (
    <div className="flex flex-col gap-3">
      {/* Main image */}
      <div className="relative aspect-[4/5] overflow-hidden bg-warm">
        {images[active] ? (
          <Image
            src={images[active]}
            alt={name}
            fill
            priority
            sizes="(max-width: 1024px) 100vw, 50vw"
            className="object-cover transition-opacity duration-300"
          />
        ) : (
          <div className="flex h-full items-center justify-center bg-warm">
            <span className="font-display text-5xl text-faint select-none">M</span>
          </div>
        )}
        {tag && (
          <span className="absolute top-4 left-4 bg-ink text-paper text-2xs font-semibold tracking-widest uppercase px-3 py-1.5">
            {tag}
          </span>
        )}
      </div>

      {/* Thumbnails */}
      {images.length > 1 && (
        <div className="grid grid-cols-4 gap-2">
          {images.slice(0, 8).map((img, i) => (
            <button
              key={i}
              onClick={() => setActive(i)}
              className={`relative aspect-square overflow-hidden bg-warm border-2 transition-all ${
                active === i ? 'border-clay' : 'border-transparent hover:border-mist'
              }`}
            >
              <Image src={img} alt={`${name} ${i + 1}`} fill sizes="15vw" className="object-cover" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
