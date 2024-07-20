// eslint-disable-next-line import/no-unresolved
import { Args, Command } from '@oclif/core'
import { bootstrap } from '../../../dist/server/src/main'

export default class Start extends Command {
  static args = {
    port: Args.string({
      description: 'Custom port to run the server on',
      required: false,
    }),
  }

  static description = 'Starts the codeclimbers server on your machine'

  static examples = [`<%= config.bin %> <%= command.id %>`]

  async run(): Promise<void> {
    const { args } = await this.parse(Start)
    process.env.PORT = args.port || '14400' // number of minutes in a day times 10
    process.env.APP_CONTEXT = 'cli'
    bootstrap()
  }
}