import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ExampleEntity } from './entities/example.entity';
import { CreateExampleDto } from './dto/create-example.dto';
import { UpdateExampleDto } from './dto/update-example.dto';

@Injectable()
export class ExampleService {
  constructor(
    @InjectRepository(ExampleEntity)
    private readonly exampleRepository: Repository<ExampleEntity>,
  ) {}

  async create(createDto: CreateExampleDto): Promise<ExampleEntity> {
    const example = this.exampleRepository.create(createDto);
    return this.exampleRepository.save(example);
  }

  async findAll(options?: { page?: number; limit?: number }): Promise<ExampleEntity[]> {
    const page = options?.page || 1;
    const limit = options?.limit || 10;
    const skip = (page - 1) * limit;

    return this.exampleRepository.find({
      skip,
      take: limit,
      order: { createdAt: 'DESC' },
    });
  }

  async findOne(id: string): Promise<ExampleEntity> {
    const example = await this.exampleRepository.findOne({ where: { id } });
    if (!example) {
      throw new NotFoundException(`Example with ID ${id} not found`);
    }
    return example;
  }

  async update(id: string, updateDto: UpdateExampleDto): Promise<ExampleEntity> {
    const example = await this.findOne(id);
    Object.assign(example, updateDto);
    return this.exampleRepository.save(example);
  }

  async remove(id: string): Promise<void> {
    const example = await this.findOne(id);
    await this.exampleRepository.remove(example);
  }
}
