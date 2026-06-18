import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  HttpStatus,
  HttpCode,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { ExampleService } from './example.service';
import { CreateExampleDto } from './dto/create-example.dto';
import { UpdateExampleDto } from './dto/update-example.dto';
import { ExampleEntity } from './entities/example.entity';

@ApiTags('examples')
@Controller('examples')
@UseGuards(JwtAuthGuard)
export class ExampleController {
  constructor(private readonly exampleService: ExampleService) {}

  @Post()
  @ApiOperation({ summary: 'Create a new example' })
  @ApiResponse({ status: 201, description: 'Example created successfully', type: ExampleEntity })
  @ApiResponse({ status: 400, description: 'Invalid input' })
  @HttpCode(HttpStatus.CREATED)
  async create(@Body() createDto: CreateExampleDto): Promise<ExampleEntity> {
    return this.exampleService.create(createDto);
  }

  @Get()
  @ApiOperation({ summary: 'Get all examples' })
  @ApiResponse({ status: 200, description: 'List of examples', type: [ExampleEntity] })
  async findAll(
    @Query('page') page?: number,
    @Query('limit') limit?: number,
  ): Promise<ExampleEntity[]> {
    return this.exampleService.findAll({ page, limit });
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get example by ID' })
  @ApiResponse({ status: 200, description: 'Example found', type: ExampleEntity })
  @ApiResponse({ status: 404, description: 'Example not found' })
  async findOne(@Param('id') id: string): Promise<ExampleEntity> {
    return this.exampleService.findOne(id);
  }

  @Put(':id')
  @ApiOperation({ summary: 'Update example by ID' })
  @ApiResponse({ status: 200, description: 'Example updated', type: ExampleEntity })
  @ApiResponse({ status: 404, description: 'Example not found' })
  async update(
    @Param('id') id: string,
    @Body() updateDto: UpdateExampleDto,
  ): Promise<ExampleEntity> {
    return this.exampleService.update(id, updateDto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete example by ID' })
  @ApiResponse({ status: 204, description: 'Example deleted' })
  @ApiResponse({ status: 404, description: 'Example not found' })
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(@Param('id') id: string): Promise<void> {
    return this.exampleService.remove(id);
  }
}
