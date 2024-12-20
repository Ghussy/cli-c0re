import { Injectable } from '@nestjs/common'
import { CreateWakatimePulseDto } from '../dtos/createWakatimePulse.dto'
import { PulseRepo } from '../database/pulse.repo'
import os from 'node:os'
import dayjs, { Dayjs } from 'dayjs'
import { TimePeriodDto } from '../dtos/getCategoryTimeOverview.dto'
import { PageDto, PageMetaDto, PageOptionsDto } from '../dtos/pagination.dto'
import {
  mapStatusBarRawToDto,
  pulseSuccessResponse,
  filterUniqueByHash,
  getSourceFromUserAgent,
  calculatePulseHash,
} from '../../../utils/activities.util'
import assert from 'node:assert'

@Injectable()
export class ActivitiesService {
  constructor(private readonly pulseRepo: PulseRepo) {
    this.pulseRepo = pulseRepo
  }
  async getActivityStatusBar(): Promise<CodeClimbers.ActivitiesStatusBar> {
    const statusBarRaw = await this.pulseRepo.getStatusBarDetails()
    // these next 5 lines to get the dayTotalMinutes are all that is shown in the status bar in vscode and the other plugins but the statusBar details are needed to be returned so that the extensions don't error
    const startDate = dayjs().startOf('day').toISOString()
    const endDate = dayjs().endOf('day').toISOString()
    const data = await this.pulseRepo.getCategoryTimeOverview(
      startDate,
      endDate,
    )
    const dayTotalMinutes = data.reduce((acc, curr) => acc + curr.minutes, 0)
    return mapStatusBarRawToDto(statusBarRaw, dayTotalMinutes)
  }
  // process the pulse
  async createPulse(pulseDto: CreateWakatimePulseDto) {
    const latestProject = await this.pulseRepo.getLatestProject()
    const pulse: CodeClimbers.Pulse = this.mapDtoToPulse(
      pulseDto,
      latestProject,
    )
    await this.pulseRepo.createPulse(pulse)
    return pulseSuccessResponse(1)
  }

  async createPulses(pulsesDto: CreateWakatimePulseDto[]) {
    assert(pulsesDto, 'pulsesDto required')
    assert(Array.isArray(pulsesDto), 'Pulses must be an array')
    const latestProject = await this.pulseRepo.getLatestProject()
    const pulses: CodeClimbers.Pulse[] = pulsesDto.map((dto) =>
      this.mapDtoToPulse(dto, latestProject),
    )
    const uniquePulses = filterUniqueByHash(pulses)

    await this.pulseRepo.createPulses(uniquePulses)
    return pulseSuccessResponse(pulsesDto.length)
  }

  async getLatestPulses(): Promise<CodeClimbers.Pulse[] | undefined> {
    return this.pulseRepo.getLatestPulses()
  }

  async getCategoryTimeOverview(
    periods: TimePeriodDto[],
  ): Promise<CodeClimbers.TimeOverview[][]> {
    const resultsPromises = periods.map((period) => {
      if (!period.startDate || !period.endDate) {
        throw new Error('Invalid time period')
      }
      return this.pulseRepo.getCategoryTimeOverview(
        period.startDate,
        period.endDate,
      )
    })
    const results = await Promise.all(resultsPromises)
    return results
  }

  async getWeekOverview(date: string): Promise<CodeClimbers.WeekOverview> {
    const currentDate = new Date(date)
    const weekStart = new Date(
      new Date(currentDate).setDate(currentDate.getDate() - 7),
    )

    const tomorrow = new Date(new Date(date).setDate(currentDate.getDate() + 1))

    const yesterday = new Date(
      new Date(date).setDate(currentDate.getDate() - 1),
    )

    const longestDayMinutes = await this.pulseRepo.getLongestDayInRangeMinutes(
      weekStart,
      currentDate,
    )
    const yesterdayMinutes = await this.pulseRepo.getRangeMinutes(
      yesterday,
      currentDate,
    )
    const todayMinutes = await this.pulseRepo.getRangeMinutes(
      currentDate,
      tomorrow,
    )
    const weekMinutes = await this.pulseRepo.getRangeMinutes(
      weekStart,
      currentDate,
    )

    return {
      longestDayMinutes,
      yesterdayMinutes,
      todayMinutes,
      weekMinutes,
    }
  }

  async getSources(): Promise<CodeClimbers.Source[]> {
    const userAgentsAndLastActive =
      await this.pulseRepo.getUniqueUserAgentsAndLastActive()
    const sources = new Set<string>()

    userAgentsAndLastActive.forEach((userAgent) => {
      const source = getSourceFromUserAgent(userAgent.userAgent)
      if (source) {
        sources.add(source)
      }
    })

    return Array.from(sources).map((source) => {
      const maxLastActive = userAgentsAndLastActive
        .filter((userAgent) => {
          return source === getSourceFromUserAgent(userAgent.userAgent)
        })
        .reduce((max, userAgent) => {
          return new Date(userAgent.lastActive) > new Date(max)
            ? userAgent.lastActive
            : max
        }, new Date(0).toISOString())
      return { name: source, lastActive: maxLastActive }
    })
  }

  async getSourcesMinutes(
    startDate: string,
    endDate: string,
  ): Promise<CodeClimbers.SourceMinutes[]> {
    const userSources = await this.getSources()
    const sourcesWithMinutes = await this.pulseRepo.getSourcesMinutes(
      startDate,
      endDate,
    )
    return Object.keys(sourcesWithMinutes)
      .map((key) => {
        const lastActive =
          userSources.find((source) =>
            source.name.toLowerCase().includes(key.toLowerCase()),
          )?.lastActive ?? null
        if (lastActive === null) return null

        return {
          name: key,
          minutes: sourcesWithMinutes[key],
          lastActive,
        }
      })
      .filter((item) => item !== null)
  }

  async getSitesMinutes(
    startDate: string,
    endDate: string,
  ): Promise<CodeClimbers.SiteMinutes[]> {
    const sitesWithMinutes = await this.pulseRepo.getSitesMinutes(
      startDate,
      endDate,
    )

    return Object.keys(sitesWithMinutes)
      .map((key) => {
        const value = sitesWithMinutes[key]
        if (value === 0) return null

        return {
          name: key,
          minutes: value * 2,
        }
      })
      .filter((item) => item !== null)
  }

  async getDeepWork(
    startDate: string,
    endDate: string,
  ): Promise<CodeClimbers.DeepWorkTime[]> {
    return this.pulseRepo.getDeepWork(startDate, endDate)
  }

  async generatePulsesCSV(): Promise<Buffer> {
    const pulses = await this.pulseRepo.getAllPulses()
    const csvString = this.convertRecordsToCSV(pulses)
    return Buffer.from(csvString, 'utf-8')
  }

  getDeepWorkBetweenDates = async (
    selectedStartDate: Dayjs,
    selectedEndDate: Dayjs,
  ): Promise<CodeClimbers.DeepWorkPeriod[]> => {
    const startDate = selectedStartDate?.startOf('day').toISOString()
    const endDate = selectedEndDate?.endOf('day').toISOString()

    const records = await this.pulseRepo.getDeepWork(startDate, endDate)

    const periods: CodeClimbers.DeepWorkPeriod[] = []
    let currentPeriod: CodeClimbers.DeepWorkPeriod | null = null

    const isSameDay = (date1: string, date2: string) => {
      return new Date(date1).toDateString() === new Date(date2).toDateString()
    }

    records.forEach((item) => {
      if (currentPeriod && isSameDay(currentPeriod.startDate, item.flowStart)) {
        currentPeriod.endDate = item.flowStart
        currentPeriod.time += item.flowTime
      } else {
        if (currentPeriod) {
          periods.push(currentPeriod)
        }
        currentPeriod = {
          startDate: item.flowStart,
          endDate: item.flowStart,
          time: item.flowTime,
        }
      }
    })

    if (currentPeriod) {
      periods.push(currentPeriod)
    }

    return periods
  }

  getProjectsTimeByRangeAndCategory = async (
    selectedStartDate: Dayjs,
    selectedEndDate: Dayjs,
  ): Promise<CodeClimbers.PerProjectTimeAndCategoryOverview> => {
    const startDate = selectedStartDate?.startOf('day').toISOString()
    const endDate = selectedEndDate?.endOf('day').toISOString()

    const records = await this.pulseRepo.getTimeByProjectCategoryAndRange(
      startDate,
      endDate,
    )

    return records.reduce((acc, row) => {
      if (!acc[row.category]) {
        acc[row.category] = []
      }

      acc[row.category].push({ name: row.name, minutes: row.minutes })

      return acc
    }, {} as CodeClimbers.PerProjectTimeAndCategoryOverview)
  }

  getProjectsTimeByRange = async (
    selectedStartDate: Dayjs,
    selectedEndDate: Dayjs,
  ): Promise<CodeClimbers.PerProjectTimeOverviewDB[]> => {
    const startDate = selectedStartDate?.startOf('day').toISOString()
    const endDate = selectedEndDate?.endOf('day').toISOString()

    const records = await this.pulseRepo.getTimeByProjectAndRange(
      startDate,
      endDate,
    )

    return records
  }

  getSocialMediaTimeByRange = async (
    selectedStartDate: Dayjs,
    selectedEndDate: Dayjs,
  ): Promise<CodeClimbers.EntityTimeOverviewDB[]> => {
    const startDate = selectedStartDate?.startOf('day').toISOString()
    const endDate = selectedEndDate?.endOf('day').toISOString()

    const records = await this.pulseRepo.getTimeByEntityAndRange(
      startDate,
      endDate,
    )

    const sites = [
      'facebook',
      'instagram',
      'twitter',
      'linkedin',
      'tiktok',
      'snapchat',
      'youtube',
      'twitch',
      'pinterest',
    ]

    const socialMediaTimes = records.filter((row) =>
      sites.some((site) => row.entity.toLowerCase().includes(site)),
    )

    return socialMediaTimes
  }

  getGrowthAndMasteryScore = async (
    selectedStartDate: Dayjs,
    selectedEndDate: Dayjs,
  ): Promise<CodeClimbers.EntityTimeOverviewDB[]> => {
    const startDate = selectedStartDate?.startOf('day').toISOString()
    const endDate = selectedEndDate?.endOf('day').toISOString()
    const records = await this.pulseRepo.getTimeByEntityAndRange(
      startDate,
      endDate,
    )

    const sites = [
      'mozilla',
      'stackoverflow',
      'devdocs',
      'coursera',
      'udemy',
      'codeacademy',
      'theodinproject',
      'freecodecamp',
      'daily.dev',
      'dev.to',
      'hackernews',
      'leetcode',
      'hackerank',
    ]

    const growthSites = records.filter((row) =>
      sites.some((site) => row.entity.toLowerCase().includes(site)),
    )
    return growthSites
  }

  getCategoryTimeByRange = async (
    selectedStartDate: Dayjs,
    selectedEndDate: Dayjs,
  ): Promise<CodeClimbers.CategoryTimeOverviewDB[]> => {
    const startDate = selectedStartDate?.startOf('day').toISOString()
    const endDate = selectedEndDate?.endOf('day').toISOString()

    const records = await this.pulseRepo.getTimeByCategoryAndRange(
      startDate,
      endDate,
    )

    // merge category 'communication' with 'communicating'
    const mergedRecords = records
      .map((row) => {
        if (row.category === 'communication') {
          return { ...row, category: 'communicating' }
        }
        return row
      })
      .reduce((acc, row) => {
        const existingCategory = acc.find((c) => c.category === row.category)
        if (existingCategory) {
          existingCategory.minutes += row.minutes
        } else {
          acc.push(row)
        }
        return acc
      }, [] as CodeClimbers.CategoryTimeOverviewDB[])

    return mergedRecords
  }

  getTotalTimeByRange = async (
    selectedStartDate: Dayjs,
    selectedEndDate: Dayjs,
  ): Promise<number> => {
    const timeRecords = await this.getCategoryTimeByRange(
      selectedStartDate,
      selectedEndDate,
    )
    return timeRecords.reduce((acc, row) => acc + row.minutes, 0)
  }

  private userAgent() {
    const platform = os.platform()
    const release = os.release()
    const arch = os.arch()
    const nodeVersion = process.version

    return `Node/${nodeVersion.slice(1)} (${platform}; ${arch}) OS/${release}`
  }

  private mapDtoToPulse(
    dto: CreateWakatimePulseDto,
    latestProject?: string,
  ): CodeClimbers.Pulse {
    const project =
      (dto.project === '<<PROJECT>>' || !dto.project) && latestProject
        ? latestProject
        : dto.project

    return {
      userId: 'local',
      project,
      branch: dto.branch,
      entity: dto.entity,
      type: dto.type,
      isWrite: dto.is_write || false,
      editor: dto.editor || '',
      language: dto.language || Intl.DateTimeFormat().resolvedOptions().locale,
      operatingSystem: dto.operating_system || os.platform(),
      machine: dto.machine || os.hostname(),
      userAgent: dto.user_agent || this.userAgent(),
      time: dayjs((dto.time as number) * 1000).toISOString(),
      hash: `${calculatePulseHash(dto)}`,
      origin: dto.origin || '',
      originId: dto.origin_id || '',
      category: dto.category || '',
      createdAt: dayjs().toISOString(),
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private convertRecordsToCSV = (records: Record<string, any>[]): string => {
    console.log('records', records)
    const header = Object.keys(records[0]).join(',')
    const rows = records.map((row) =>
      Object.values(row).map((value) =>
        value === null ? '' : value?.toString(),
      ),
    )

    return [header, ...rows].join('\n')
  }

  async getPerProjectOverviewTopThree(
    startDate: string,
    endDate: string,
  ): Promise<CodeClimbers.PerProjectTimeAndCategoryOverview> {
    return await this.pulseRepo.getPerProjectOverviewTopThree(
      startDate,
      endDate,
    )
  }

  async getPerProjectOverviewByCategory(
    startDate: string,
    endDate: string,
    category: string,
    pageOptionsDto: PageOptionsDto,
  ): Promise<PageDto<CodeClimbers.ProjectTimeOverview>> {
    const results = await this.pulseRepo.getPerProjectOverviewByCategory(
      startDate,
      endDate,
      category,
      pageOptionsDto,
    )
    const count = results.length
    const pageMetaDto = new PageMetaDto({ count, pageOptionsDto })

    return new PageDto(results, pageMetaDto)
  }
}
