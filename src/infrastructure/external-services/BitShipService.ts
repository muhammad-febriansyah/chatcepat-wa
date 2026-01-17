import { injectable } from 'inversify';
import axios, { AxiosInstance } from 'axios';
import { env } from '@shared/config/env';

export interface BitShipRate {
  courier_name: string;
  courier_service_name: string;
  description: string;
  price: number;
  duration: string;
}

@injectable()
export class BitShipService {
  private client: AxiosInstance;

  constructor() {
    this.client = axios.create({
      baseURL: 'https://api.biteship.com/v1',
      headers: {
        'Authorization': env.bitshipApiKey,
        'Content-Type': 'application/json',
      },
    });
  }

  async getRates(
    originPostalCode: string,
    destinationPostalCode: string,
    weight: number = 1000, // in grams
    couriers: string = 'jne,jnt,sicepat,anteraja'
  ): Promise<BitShipRate[]> {
    try {
      console.log(`📦 BitShip: Getting rates from ${originPostalCode} to ${destinationPostalCode}`);

      const response = await this.client.post('/rates/couriers', {
        origin_postal_code: parseInt(originPostalCode),
        destination_postal_code: parseInt(destinationPostalCode),
        couriers,
        items: [{
          name: 'Paket',
          value: 10000,
          weight,
        }],
      });

      console.log(`✅ BitShip API response status:`, response.status);

      const pricing = response.data?.pricing;

      if (!pricing || pricing.length === 0) {
        console.log('❌ No rates available from BitShip');
        return [];
      }

      console.log(`✅ Found ${pricing.length} rate options from BitShip`);

      return pricing.map((rate: any) => ({
        courier_name: rate.courier_name,
        courier_service_name: rate.courier_service_name,
        description: rate.description || rate.courier_service_name,
        price: rate.price,
        duration: rate.duration || '1-2 hari',
      }));
    } catch (error: any) {
      console.error('❌ BitShip API error:');
      console.error('   Status:', error.response?.status);
      console.error('   Data:', JSON.stringify(error.response?.data).substring(0, 200));
      console.error('   Message:', error.message);
      throw error;
    }
  }

  formatRatesReply(rates: BitShipRate[], origin: string, destination: string): string {
    if (rates.length === 0) {
      return 'Maaf, tidak ada layanan pengiriman yang tersedia.';
    }

    let reply = `📦 *Ongkir ${origin} → ${destination}*\n\n`;

    // Group by courier
    const groupedByCourier: Record<string, BitShipRate[]> = {};

    for (const rate of rates) {
      const courierName = rate.courier_name.toUpperCase();
      if (!groupedByCourier[courierName]) {
        groupedByCourier[courierName] = [];
      }
      groupedByCourier[courierName].push(rate);
    }

    // Format each courier
    for (const [courier, services] of Object.entries(groupedByCourier)) {
      reply += `*${courier}*\n`;

      for (const service of services) {
        const formattedPrice = this.formatCurrency(service.price);
        reply += `• ${service.courier_service_name}: ${formattedPrice}\n`;
        if (service.description && service.description !== service.courier_service_name) {
          reply += `  _${service.description}_\n`;
        }
        reply += `  Estimasi: ${service.duration}\n\n`;
      }
    }

    reply += '_*Berat: 1 kg_\n';
    reply += '_Harga dapat berubah sewaktu-waktu_';

    return reply;
  }

  private formatCurrency(amount: number): string {
    return new Intl.NumberFormat('id-ID', {
      style: 'currency',
      currency: 'IDR',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount);
  }
}
