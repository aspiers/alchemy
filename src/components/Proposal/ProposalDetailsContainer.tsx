import { Address, IDAOState, IProposalStage, IProposalState, IRewardState, IVote } from "@daostack/client";
import * as arcActions from "actions/arcActions";
import { checkNetworkAndWarn, getArc } from "arc";
import BN = require("bn.js");
import * as classNames from "classnames";
import AccountPopupContainer from "components/Account/AccountPopupContainer";
import AccountProfileName from "components/Account/AccountProfileName";
import Countdown from "components/Shared/Countdown";
import { ActionTypes, default as PreTransactionModal } from "components/Shared/PreTransactionModal";
import Subscribe, { IObservableState } from "components/Shared/Subscribe";
import { DiscussionEmbed } from "disqus-react";
import { humanProposalTitle } from "lib/util";
import * as moment from "moment";
import * as React from "react";
import { BreadcrumbsItem } from "react-breadcrumbs-dynamic";
import { connect } from "react-redux";
import { Link, RouteComponentProps } from "react-router-dom";
import { IRootState } from "reducers";
import { closingTime, VoteOptions } from "reducers/arcReducer";
import { proposalEnded, proposalFailed, proposalPassed } from "reducers/arcReducer";
import { showNotification } from "reducers/notifications";
import { IProfileState } from "reducers/profilesReducer";
import { combineLatest, concat, of } from "rxjs";
import { isRedeemPending, isVotePending } from "selectors/operations";
import PredictionBox from "./PredictionBox";
import * as css from "./ProposalDetails.scss";
import RedeemButton from "./RedeemButton";
import RedemptionsTip from "./RedemptionsTip";
import TransferDetails from "./TransferDetails";
import VoteButtons from "./VoteButtons";
import VoteGraph from "./VoteGraph";
import VoteBreakdown from "./VoteBreakdown";

interface IStateProps {
  beneficiaryProfile?: IProfileState;
  creatorProfile?: IProfileState;
  currentAccountAddress: Address;
  daoEthBalance: BN;
  rewardsForCurrentUser: IRewardState[];
  votesOfCurrentUser: IVote[];
  dao: IDAOState;
  proposal: IProposalState;
  isVotingYes: boolean;
  isVotingNo: boolean;
  isRedeemPending: boolean;
}

interface IContainerProps extends RouteComponentProps<any> {
  dao: IDAOState;
  currentAccountAddress: Address;
  daoEthBalance: BN;
  proposal: IProposalState;
  rewardsForCurrentUser: IRewardState[];
  votesOfCurrentUser: IVote[];
}

// TODO: we shouldnt need/want this anymore
const mapStateToProps = (state: IRootState, ownProps: IContainerProps): IStateProps => {
  const proposal = ownProps.proposal;
  const dao = ownProps.dao;

  return {
    beneficiaryProfile: state.profiles[proposal.beneficiary],
    creatorProfile: state.profiles[proposal.proposer],
    currentAccountAddress: ownProps.currentAccountAddress,
    dao,
    daoEthBalance: ownProps.daoEthBalance,
    isVotingYes: isVotePending(proposal.id, VoteOptions.Yes)(state),
    isVotingNo: isVotePending(proposal.id, VoteOptions.No)(state),
    isRedeemPending: ownProps.currentAccountAddress && isRedeemPending(proposal.id, ownProps.currentAccountAddress)(state),
    proposal,
    rewardsForCurrentUser: ownProps.rewardsForCurrentUser,
    votesOfCurrentUser: ownProps.votesOfCurrentUser
  };
};

interface IDispatchProps {
  executeProposal: typeof arcActions.executeProposal;
  redeemProposal: typeof arcActions.redeemProposal;
  showNotification: typeof showNotification;
  stakeProposal: typeof arcActions.stakeProposal;
}

const mapDispatchToProps = {
  redeemProposal: arcActions.redeemProposal,
  executeProposal: arcActions.executeProposal,
  showNotification,
  stakeProposal: arcActions.stakeProposal,
};

type IProps = IStateProps & IDispatchProps & IContainerProps;

interface IState {
  preRedeemModalOpen: boolean;
  expired: boolean;
}

class ProposalDetailsContainer extends React.Component<IProps, IState> {

  constructor(props: IProps) {
    super(props);
    this.state = {
      preRedeemModalOpen: false,
      expired: closingTime(props.proposal).isSameOrBefore(moment())
    };

  }

  public async handleClickExecute(event: any) {
    if (!(await checkNetworkAndWarn(this.props.showNotification))) { return; }
    this.props.executeProposal(this.props.dao.address, this.props.proposal.id, this.props.currentAccountAddress);
  }

  public handleClickRedeem(event: any) {
    this.setState({ preRedeemModalOpen: true });
  }

  public closePreRedeemModal(event: any) {
    this.setState({ preRedeemModalOpen: false });
  }

  public countdownEnded() {
    this.setState({ expired: true });
  }

  public render() {
    const {
      beneficiaryProfile,
      creatorProfile,
      currentAccountAddress,
      dao,
      daoEthBalance,
      proposal,
      redeemProposal,
      executeProposal,
      isVotingNo,
      isVotingYes,
      isRedeemPending,
      rewardsForCurrentUser,
      votesOfCurrentUser
    } = this.props;

    const expired = this.state.expired;

    // TODO: should be the DAO balance of the proposal.externalToken
    const externalTokenBalance = dao.externalTokenBalance || new BN(0);

    const beneficiaryHasRewards = (
      !proposal.reputationReward.isZero() ||
      proposal.nativeTokenReward.gt(new BN(0)) ||
      (proposal.ethReward.gt(new BN(0)) && daoEthBalance.gte(proposal.ethReward)) ||
      (proposal.externalTokenReward.gt(new BN(0)) && externalTokenBalance.gte(proposal.externalTokenReward))
    ) as boolean;

    const accountHasRewards = rewardsForCurrentUser.length !== 0;
    const redeemable = proposal.executedAt && (accountHasRewards || beneficiaryHasRewards);
    const executable = proposalEnded(proposal) && !proposal.executedAt;
    const isVoting = isVotingNo || isVotingYes;

    const proposalClass = classNames({
        [css.detailView]: true,
        [css.clearfix]: true,
        [css.proposal]: true,
        [css.openProposal]: proposal.stage === IProposalStage.Queued ||
          proposal.stage === IProposalStage.PreBoosted ||
          proposal.stage === IProposalStage.Boosted ||
          proposal.stage === IProposalStage.QuietEndingPeriod,
        [css.failedProposal]: proposalFailed(proposal),
        [css.passedProposal]: proposalPassed(proposal),
        [css.redeemable]: redeemable
      });

    let currentAccountVote = 0;

    const redeemProps = {
        accountHasRewards,
        isRedeemPending,
        redeemable,
        executable,
        beneficiaryHasRewards,
        rewards: rewardsForCurrentUser,
        currentAccountAddress,
        dao,
        proposal
      };

    const redemptionsTip = RedemptionsTip(redeemProps);

    let currentVote: IVote;
    if (votesOfCurrentUser.length > 0) {
      currentVote = votesOfCurrentUser[0];
      currentAccountVote = currentVote.outcome;
    }

    const url = proposal.url ? (/https?:\/\//.test(proposal.url) ? proposal.url : "//" + proposal.url) : null;

    const voteWrapperClass = classNames({
      [css.detailView] : true,
      [css.voteBox] : true,
      [css.clearfix] : true,
      [css.unconfirmedVote] : isVoting
    });

    const voteStatusClass = classNames({
      [css.voteStatus]: true
    });

    const voteControls = classNames({
      [css.voteControls]: true
    });

    const disqusConfig = {
      url: process.env.BASE_URL + this.props.location.pathname,
      identifier: proposal.id,
      title: proposal.title
    };

    return (
      <div className={css.proposalContainer}>
        <BreadcrumbsItem to={"/dao/" + dao.address + "/proposal" + proposal.id}>{proposal.title}</BreadcrumbsItem>

        <div className={proposalClass + " " + css.clearfix} data-test-id={"proposal-" + proposal.id}>
          <div className={css.proposalInfo}>
            <h3 className={css.proposalTitleTop}>
              <span data-test-id="proposal-closes-in">
                {proposal.stage === IProposalStage.QuietEndingPeriod ?
                  <strong>
                    <img src="/assets/images/Icon/Overtime.svg" /> OVERTIME: CLOSES {closingTime(proposal).fromNow().toUpperCase()}
                    <div className={css.help}>
                      <img src="/assets/images/Icon/Help-light.svg" />
                      <img className={css.hover} src="/assets/images/Icon/Help-light-hover.svg" />
                      <div className={css.helpBox}>
                        <div className={css.pointer}></div>
                        <div className={css.bg}></div>
                        <div className={css.bridge}></div>
                        <div className={css.header}>
                          <h2>Genesis Protocol</h2>
                          <h3>RULES FOR OVERTIME</h3>
                        </div>
                        <div className={css.body}>
                          <p>Boosted proposals can only pass if the final 1 day of voting has seen “no change of decision”. In case of change of decision on the last day of voting, the voting period is increased one day. This condition (and procedure) remains until a resolution is reached, with the decision kept unchanged for the last 24 hours.</p>
                        </div>
                        <a href="https://docs.google.com/document/d/1LMe0S4ZFWELws1-kd-6tlFmXnlnX9kfVXUNzmcmXs6U/edit?usp=drivesdk" target="_blank">View the Genesis Protocol</a>
                      </div>
                    </div>
                  </strong>
                  : " "
                }
              </span>

              <div>
                {expired && proposal.stage === IProposalStage.Boosted ?
                <button className={css.executeProposal} onClick={this.handleClickExecute.bind(this)}>
                  <img src="/assets/images/Icon/execute.svg"/>
                  <span>Execute</span>
                </button>
                : redeemable ?
                  <RedeemButton handleClickRedeem={this.handleClickRedeem.bind(this)} {...redeemProps} />
                : " "
                }
              </div>

              <Link to={"/dao/" + dao.address + "/proposal/" + proposal.id} data-test-id="proposal-title">{humanProposalTitle(proposal)}</Link>
            </h3>
            <div className={css.cardTop + " " + css.clearfix}>
              <div className={css.timer}>
                {!proposalEnded(proposal) ?
                    !expired ?
                      <Countdown toDate={closingTime(proposal)} detailView={true} onEnd={this.countdownEnded.bind(this)} /> :
                      <span className={css.closedTime}>
                        {proposal.stage === IProposalStage.Queued ? "Expired" :
                         proposal.stage === IProposalStage.PreBoosted ? "Ready to Boost" : // TODO: handle case of below threshold
                         "Closed"}&nbsp;
                         {closingTime(proposal).format("MMM D, YYYY")}
                      </span>
                    : " "
                }
              </div>

            </div>
            <div className={css.createdBy}>
              <AccountPopupContainer accountAddress={proposal.proposer} dao={dao} detailView={true}/>
              <AccountProfileName accountAddress={proposal.proposer} accountProfile={creatorProfile} daoAvatarAddress={dao.address} detailView={true}/>
            </div>
            <div className={css.description}>
              {proposal.description}
            </div>
            {url ?
              <a href={url} className={css.attachmentLink} target="_blank">
                <img src="/assets/images/Icon/Attachment.svg"/>
                Attachment &gt;
              </a>
              : " "
            }
            <h3 className={css.proposalTitleBottom}>
              <span data-test-id="proposal-closes-in">
                {proposal.stage === IProposalStage.QuietEndingPeriod ?
                  <strong>
                    <img src="/assets/images/Icon/Overtime.svg" /> OVERTIME: CLOSES {closingTime(proposal).fromNow().toUpperCase()}
                    <div className={css.help}>
                      <img src="/assets/images/Icon/Help-light.svg" />
                      <img className={css.hover} src="/assets/images/Icon/Help-light-hover.svg" />
                      <div className={css.helpBox}>
                        <div className={css.pointer}></div>
                        <div className={css.bg}></div>
                        <div className={css.bridge}></div>
                        <div className={css.header}>
                          <h2>Genesis Protocol</h2>
                          <h3>RULES FOR OVERTIME</h3>
                        </div>
                        <div className={css.body}>
                          <p>Boosted proposals can only pass if the final 1 day of voting has seen “no change of decision”. In case of change of decision on the last day of voting, the voting period is increased one day. This condition (and procedure) remains until a resolution is reached, with the decision kept unchanged for the last 24 hours.</p>
                        </div>
                        <a href="https://docs.google.com/document/d/1LMe0S4ZFWELws1-kd-6tlFmXnlnX9kfVXUNzmcmXs6U/edit?usp=drivesdk" target="_blank">View the Genesis Protocol</a>
                      </div>
                    </div>
                  </strong>
                  : " "
                }
              </span>
              <Link className={css.detailLink} to={"/dao/" + dao.address + "/proposal/" + proposal.id} data-test-id="proposal-title">
                {humanProposalTitle(proposal)}
                <img src="/assets/images/Icon/Open.svg"/>
              </Link>
            </h3>
            <TransferDetails proposal={proposal} dao={dao} beneficiaryProfile={beneficiaryProfile} detailView={true}/>

            <div className={css.stateChange}>
              {expired && proposal.stage === IProposalStage.PreBoosted ?
                <button className={css.boostProposal} onClick={this.handleClickExecute.bind(this)} data-test-id="buttonBoost">
                  <img src="/assets/images/Icon/boost.svg"/>
                  <span>Boost</span>
                </button>
                :
                <VoteButtons currentAccountAddress={currentAccountAddress} currentVote={currentAccountVote} dao={dao} expired={expired} isVotingNo={isVotingNo} isVotingYes={isVotingYes} proposal={proposal} altStyle={true} />
              }
            </div>
          </div>

          <div className={css.proposalActions + " " + css.clearfix}>
            <div className={voteWrapperClass}>
              <div className={voteStatusClass} >
                <div className={css.statusTitle}>
                  <h3>Votes</h3>
                  <span>{proposal.votesCount} Vote{proposal.votesCount === 1 ? "" : "s"}</span>
                </div>

                <VoteButtons currentAccountAddress={currentAccountAddress} currentVote={currentAccountVote} dao={dao} expired={expired} isVotingNo={isVotingNo} isVotingYes={isVotingYes} proposal={proposal} />
              </div>

              <div className={voteControls + " " + css.clearfix}>
                <div className={css.voteDivider}>
                  <VoteGraph size={90} dao={dao} proposal={proposal }/>
                </div>

                <VoteBreakdown currentAccountAddress={currentAccountAddress} currentVote={currentAccountVote} dao={dao} isVotingNo={isVotingNo} isVotingYes={isVotingYes} proposal={proposal} detailView={true} />
              </div>
            </div>

            {proposalEnded(proposal) ?
              <div>
                {this.state.preRedeemModalOpen ?
                  <PreTransactionModal
                    actionType={executable && !redeemable ? ActionTypes.Execute : ActionTypes.Redeem}
                    action={executable && !redeemable ? executeProposal.bind(null, dao.address, proposal.id) : redeemProposal.bind(null, dao.address, proposal.id, currentAccountAddress)}
                    beneficiaryProfile={beneficiaryProfile}
                    closeAction={this.closePreRedeemModal.bind(this)}
                    dao={dao}
                    effectText={redemptionsTip}
                    proposal={proposal}
                  /> : ""
                }
              </div>
              : ""
            }

            <PredictionBox
              beneficiaryProfile={beneficiaryProfile}
              currentAccountAddress={currentAccountAddress}
              dao={dao}
              expired={this.state.expired}
              proposal={proposal}
              detailView={true}
            />
          </div>
        </div>
        <h3 className={css.discussionTitle}>Discussion</h3>
        <DiscussionEmbed shortname={process.env.DISQUS_SITE} config={disqusConfig} />
      </div>
    );
  }
}

export const ConnectedProposalDetailsContainer = connect<IStateProps, IDispatchProps, IContainerProps>(mapStateToProps, mapDispatchToProps)(ProposalDetailsContainer);

export default (props: { proposalId: string, dao: IDAOState, currentAccountAddress: Address, detailView?: boolean} & RouteComponentProps<any> ) => {

  const arc = getArc();
  const dao = arc.dao(props.dao.address);
  const proposalId = props.match.params.proposalId;

  const observable = combineLatest(
    dao.proposal(proposalId).state(), // state of the current proposal
    props.currentAccountAddress ? dao.proposal(proposalId).rewards({ beneficiary: props.currentAccountAddress}) : of([]), //1
    props.currentAccountAddress ? dao.proposal(proposalId).votes({ voter: props.currentAccountAddress }) : of([]), //3
    concat(of(new BN("0")), dao.ethBalance())
  );
  return <Subscribe observable={observable}>{
    (state: IObservableState<[IProposalState, IRewardState[], IVote[], BN]>): any => {
      if (state.isLoading) {
        return <div>Loading proposal {props.proposalId.substr(0, 6)} ...</div>;
      } else if (state.error) {
        return <div>{ state.error.message }</div>;
      } else {
        const proposal = state.data[0];
        const rewards = state.data[1];
        const votes = state.data[2];
        const daoEthBalance = state.data[3];
        return <ConnectedProposalDetailsContainer
          {...props}
          daoEthBalance={daoEthBalance}
          proposal={proposal}
          dao={props.dao}
          rewardsForCurrentUser={rewards}
          votesOfCurrentUser={votes}
        />;
      }
    }
  }</Subscribe>;
};
